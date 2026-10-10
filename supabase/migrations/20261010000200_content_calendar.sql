-- Lịch nội dung dạng Kanban (duyệt 10/10/2026, phương án a): mỗi bài nội dung đi qua Ý tưởng → Viết kịch bản → Đang
-- sản xuất → Chờ duyệt → Đã lên lịch → Đã đăng. Ai có marketing.manage được chuyển cột (kể cả từ Chờ duyệt sang Đã lên
-- lịch); xem cần marketing.view. Không chứa dữ liệu khách.
--
-- Luật ở database: lên lịch phải có giờ đăng và đã tick hai mục kiểm nội dung (không hứa chữa bệnh, không dùng ảnh hay
-- thông tin khách khi chưa được đồng ý); đã đăng phải có link bài (https).

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  channel text not null check (channel in ('facebook', 'tiktok', 'zalo_oa', 'youtube', 'instagram', 'koc')),
  format text not null check (format in ('short_video', 'livestream', 'post', 'image', 'koc_video')),
  status text not null default 'idea'
    check (status in ('idea', 'script', 'production', 'review', 'scheduled', 'published')),
  owner_id uuid references public.profiles (id),
  publish_at timestamptz,
  -- Thị trường khách xem (mã trong markets), null là mọi thị trường.
  market text,
  product text check (product is null or length(product) <= 200),
  campaign_id uuid references public.campaigns (id),
  draft_url text check (draft_url is null or draft_url ~ '^https://'),
  post_url text check (post_url is null or post_url ~ '^https://'),
  note text check (note is null or length(note) <= 2000),
  -- Hai mục kiểm nội dung trước khi lên lịch: { "no_health_claim": bool, "customer_consent": bool }.
  review_checks jsonb not null default '{}'::jsonb,
  -- Thứ tự trong cột (nhỏ trước).
  position double precision not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  check (status <> 'scheduled' or publish_at is not null),
  check (status <> 'published' or post_url is not null)
);

create index content_items_board_idx on public.content_items (showroom_id, status, position) where deleted_at is null;

create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();

alter table public.content_items enable row level security;

create policy content_items_select on public.content_items for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null and public.has_perm('marketing.view'));

-- Ghi chỉ qua các hàm bên dưới (kiểm quyền, luật cột, nhật ký).
revoke insert, update, delete on public.content_items from authenticated, anon;

-- Kiểm luật của cột đích trên một dòng (đã gộp thay đổi). Lỗi trả mã dễ dịch ở server ứng dụng.
create or replace function public.check_content_stage(p_row public.content_items)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_row.status in ('scheduled', 'published') then
    if p_row.publish_at is null then
      raise exception 'publish_at_required' using errcode = 'P0001';
    end if;
    if not (coalesce((p_row.review_checks ->> 'no_health_claim')::boolean, false)
            and coalesce((p_row.review_checks ->> 'customer_consent')::boolean, false)) then
      raise exception 'review_checks_required' using errcode = 'P0001';
    end if;
  end if;
  if p_row.status = 'published' and p_row.post_url is null then
    raise exception 'post_url_required' using errcode = 'P0001';
  end if;
end;
$$;

-- Tạo hoặc sửa một bài. p: { id?, title, channel, format, status?, owner_id?, publish_at?, market?, product?,
-- campaign_id?, draft_url?, post_url?, note?, review_checks? }. Trả về id.
create or replace function public.save_content_item(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_old public.content_items;
  v_row public.content_items;
  v_market text := nullif(p ->> 'market', '');
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  v_campaign uuid := nullif(p ->> 'campaign_id', '')::uuid;
begin
  if v_market is not null and not exists (
    select 1 from public.markets where showroom_id = v_showroom and country_code = v_market
  ) then
    raise exception 'unknown market' using errcode = '22023';
  end if;
  if v_owner is not null and not exists (
    select 1 from public.profiles where id = v_owner and showroom_id = v_showroom and is_active
  ) then
    raise exception 'unknown owner' using errcode = '22023';
  end if;
  if v_campaign is not null and not exists (
    select 1 from public.campaigns where id = v_campaign and showroom_id = v_showroom and deleted_at is null
  ) then
    raise exception 'unknown campaign' using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_old from public.content_items
    where id = v_id and showroom_id = v_showroom and deleted_at is null
    for update;
    if not found then
      raise exception 'content not found' using errcode = 'no_data_found';
    end if;
    v_row := v_old;
  else
    v_row.id := gen_random_uuid();
    v_row.showroom_id := v_showroom;
    v_row.status := 'idea';
    v_row.review_checks := '{}'::jsonb;
    v_row.created_by := auth.uid();
    v_row.created_at := now();
    v_row.updated_at := now();
    v_row.position := coalesce((select max(position) from public.content_items
                                where showroom_id = v_showroom and status = coalesce(nullif(p ->> 'status', ''), 'idea')
                                  and deleted_at is null), 0) + 1;
  end if;

  v_row.title := btrim(p ->> 'title');
  v_row.channel := p ->> 'channel';
  v_row.format := p ->> 'format';
  v_row.status := coalesce(nullif(p ->> 'status', ''), v_row.status);
  v_row.owner_id := coalesce(v_owner, v_row.owner_id, auth.uid());
  v_row.publish_at := nullif(p ->> 'publish_at', '')::timestamptz;
  v_row.market := v_market;
  v_row.product := nullif(btrim(coalesce(p ->> 'product', '')), '');
  v_row.campaign_id := v_campaign;
  v_row.draft_url := nullif(btrim(coalesce(p ->> 'draft_url', '')), '');
  v_row.post_url := nullif(btrim(coalesce(p ->> 'post_url', '')), '');
  v_row.note := nullif(btrim(coalesce(p ->> 'note', '')), '');
  if p ? 'review_checks' then
    v_row.review_checks := jsonb_build_object(
      'no_health_claim', coalesce((p -> 'review_checks' ->> 'no_health_claim')::boolean, false),
      'customer_consent', coalesce((p -> 'review_checks' ->> 'customer_consent')::boolean, false));
  end if;
  v_row.published_at := case when v_row.status = 'published' then coalesce(v_row.published_at, now()) end;
  perform public.check_content_stage(v_row);

  if v_id is null then
    insert into public.content_items select v_row.*;
    v_id := v_row.id;
    perform public.write_audit('content.create', 'content_items', v_id::text,
      jsonb_build_object('channel', v_row.channel, 'status', v_row.status));
  else
    update public.content_items
      set title = v_row.title, channel = v_row.channel, format = v_row.format, status = v_row.status,
          owner_id = v_row.owner_id, publish_at = v_row.publish_at, market = v_row.market, product = v_row.product,
          campaign_id = v_row.campaign_id, draft_url = v_row.draft_url, post_url = v_row.post_url,
          note = v_row.note, review_checks = v_row.review_checks, published_at = v_row.published_at
      where id = v_id;
    if v_old.status is distinct from v_row.status then
      perform public.write_audit('content.move', 'content_items', v_id::text,
        jsonb_build_object('before', jsonb_build_object('status', v_old.status),
                           'after', jsonb_build_object('status', v_row.status)));
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_content_item(jsonb) from public, anon;
grant execute on function public.save_content_item(jsonb) to authenticated;

-- Kéo thả: chuyển cột và vị trí (đặt trước thẻ p_before, null là cuối cột). p_post_url khi chuyển sang Đã đăng.
create or replace function public.move_content_item(p_id uuid, p_status text, p_before uuid default null,
                                                    p_post_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
  v_old public.content_items;
  v_row public.content_items;
  v_pos double precision;
  v_prev double precision;
begin
  select * into v_old from public.content_items
  where id = p_id and showroom_id = v_showroom and deleted_at is null
  for update;
  if not found then
    raise exception 'content not found' using errcode = 'no_data_found';
  end if;
  if p_status not in ('idea', 'script', 'production', 'review', 'scheduled', 'published') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  if p_before is not null then
    select position into v_pos from public.content_items
    where id = p_before and showroom_id = v_showroom and status = p_status and deleted_at is null;
  end if;
  if v_pos is null then
    v_pos := coalesce((select max(position) from public.content_items
                       where showroom_id = v_showroom and status = p_status and deleted_at is null and id <> p_id), 0) + 1;
  else
    select max(position) into v_prev from public.content_items
    where showroom_id = v_showroom and status = p_status and deleted_at is null and id <> p_id and position < v_pos;
    v_pos := (coalesce(v_prev, v_pos - 1) + v_pos) / 2;
  end if;

  v_row := v_old;
  v_row.status := p_status;
  v_row.position := v_pos;
  if nullif(btrim(coalesce(p_post_url, '')), '') is not null then
    v_row.post_url := btrim(p_post_url);
  end if;
  v_row.published_at := case when p_status = 'published' then coalesce(v_old.published_at, now()) end;
  perform public.check_content_stage(v_row);

  update public.content_items
    set status = v_row.status, position = v_row.position, post_url = v_row.post_url,
        published_at = v_row.published_at
    where id = p_id;
  if v_old.status is distinct from p_status then
    perform public.write_audit('content.move', 'content_items', p_id::text,
      jsonb_build_object('before', jsonb_build_object('status', v_old.status),
                         'after', jsonb_build_object('status', p_status)));
  end if;
end;
$$;

revoke all on function public.move_content_item(uuid, text, uuid, text) from public, anon;
grant execute on function public.move_content_item(uuid, text, uuid, text) to authenticated;

-- Xóa mềm một bài (giữ lịch sử).
create or replace function public.delete_content_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
begin
  update public.content_items set deleted_at = now()
  where id = p_id and showroom_id = v_showroom and deleted_at is null;
  if not found then
    raise exception 'content not found' using errcode = 'no_data_found';
  end if;
  perform public.write_audit('content.delete', 'content_items', p_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.delete_content_item(uuid) from public, anon;
grant execute on function public.delete_content_item(uuid) to authenticated;
