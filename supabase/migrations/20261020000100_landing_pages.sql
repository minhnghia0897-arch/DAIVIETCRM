-- Landing page chạy trên CRM (Owner chốt 20/10/2026): Owner, marketing tạo trang ở Marketing → Landing page, tải HTML
-- lên (làm ở nơi khác cũng được); CRM đăng trang ở /lp/<tên-trang>, chèn sản phẩm, giá (hàm định giá), quà, liên hệ
-- lấy từ CRM; khách điền form là thành lead qua ingest_lead như mọi nguồn khác (chống trùng, chia người trực, SLA,
-- Telegram che số).
--
-- Một phiên làm việc khác đã tạo thẳng trên NGHIA (ngoài kho code) vài thứ cho landing: cột landing trên products,
-- bảng landing_settings, view landing_products, nguồn lead landing_page, bucket product-images, bảng giá landing.
-- Migration này ghi lại các phần CRM dùng tới theo kiểu "có rồi thì thôi" để kho và NGHIA khớp nhau, và siết quyền
-- các phần CRM không dùng: landing_settings, landing_products không còn mở cho người chưa đăng nhập, bucket ảnh chỉ
-- máy chủ CRM ghi. Không xóa bảng, không xóa dữ liệu.

-- ---------------------------------------------------------------------------
-- 1. Thông tin sản phẩm hiện trên landing (dùng chung mọi trang của showroom)
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists image_url text,
  add column if not exists short_desc text,
  add column if not exists gift_text text,
  add column if not exists landing_badge text,
  add column if not exists landing_sort int,
  add column if not exists show_on_landing boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Trang landing
-- ---------------------------------------------------------------------------

create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  -- Đường dẫn công khai /lp/<slug>: không có mã showroom nên duy nhất toàn hệ thống.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  title text not null check (length(btrim(title)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- HTML tải lên; trống thì dùng mẫu có sẵn trong CRM (lib/landing/).
  html text check (html is null or octet_length(html) <= 2000000),
  -- Liên hệ, đếm ngược, ảnh banner…: CRM chèn vào trang cùng sản phẩm, giá (docs/integrations/landing_page.md).
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  html_updated_at timestamptz,
  html_updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

create index landing_pages_showroom_idx on public.landing_pages (showroom_id, created_at desc);

create trigger landing_pages_updated_at before update on public.landing_pages
  for each row execute function public.set_updated_at();

alter table public.landing_pages enable row level security;

create policy landing_pages_select on public.landing_pages for select to authenticated
  using (showroom_id = (select public.current_showroom_id()) and (select public.has_perm('marketing.view')));

revoke insert, update, delete on public.landing_pages from authenticated, anon;

-- Lượt gửi form: chặn gửi dồn từ một địa chỉ IP (lưu IP đã băm, không lưu số khách). Chỉ máy chủ CRM đọc, ghi.
create table public.landing_lead_log (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  ip_hash text not null,
  result text not null check (result in ('received', 'created', 'attached', 'spam', 'limited', 'invalid', 'failed')),
  lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now()
);

create index landing_lead_log_ip_idx on public.landing_lead_log (landing_page_id, ip_hash, created_at desc);

alter table public.landing_lead_log enable row level security;
revoke all on public.landing_lead_log from authenticated, anon;

-- Nguồn lead (mục 6): sửa tên hiển thị ở Cài đặt, Danh mục.
insert into public.lead_sources (showroom_id, key, label, sort)
select s.id, 'landing_page', 'Landing page', 12 from public.showrooms s
on conflict (showroom_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Ảnh sản phẩm, banner: bucket công khai (ai cũng xem được ảnh), chỉ máy chủ CRM ghi sau khi kiểm quyền
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Bỏ các policy cho mọi tài khoản ghi vào bucket này (tạo ngoài kho code): ai đăng nhập cũng thay được ảnh trên
-- landing. Bucket công khai nên xem ảnh không cần policy.
do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%product-images%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end;
$$;

-- landing_settings, landing_products (tạo ngoài kho code): CRM không dùng; thôi mở cho người chưa đăng nhập và cho mọi
-- tài khoản sửa. Dữ liệu giữ nguyên.
do $$
declare
  r record;
begin
  if to_regclass('public.landing_settings') is not null then
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'landing_settings' loop
      execute format('drop policy %I on public.landing_settings', r.policyname);
    end loop;
    execute 'alter table public.landing_settings enable row level security';
    execute 'revoke all on public.landing_settings from anon, authenticated';
  end if;
  if to_regclass('public.landing_products') is not null then
    execute 'revoke all on public.landing_products from anon, authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ghi: qua hàm kiểm quyền (marketing.manage), có nhật ký kiểm toán
-- ---------------------------------------------------------------------------

-- p: {id?, slug, title, status?, settings?, html?}. Có khóa html mới đổi HTML (null là quay về mẫu có sẵn).
create or replace function public.save_landing_page(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_status text := coalesce(nullif(p ->> 'status', ''), 'draft');
  v_settings jsonb := coalesce(p -> 'settings', '{}'::jsonb);
begin
  if not public.has_perm('marketing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 60
     or length(v_title) not between 1 and 120 or v_status not in ('draft', 'published')
     or jsonb_typeof(v_settings) <> 'object' then
    raise exception 'invalid landing page' using errcode = '22023';
  end if;
  if exists (select 1 from public.landing_pages where slug = v_slug and id is distinct from v_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.landing_pages (showroom_id, slug, title, status, settings, created_by, updated_by)
    values (v_showroom, v_slug, v_title, v_status, v_settings, v_user, v_user)
    returning id into v_id;
  else
    update public.landing_pages
      set slug = v_slug, title = v_title, status = v_status,
          settings = case when p ? 'settings' then v_settings else settings end, updated_by = v_user
      where id = v_id and showroom_id = v_showroom;
    if not found then
      raise exception 'landing page not found' using errcode = 'P0002';
    end if;
  end if;
  if p ? 'html' then
    if octet_length(coalesce(p ->> 'html', '')) > 2000000 then
      raise exception 'invalid landing page' using errcode = '22023';
    end if;
    update public.landing_pages
      set html = nullif(p ->> 'html', ''), html_updated_at = now(), html_updated_by = v_user
      where id = v_id;
  end if;
  perform public.write_audit('landing.save', 'landing_pages', v_id::text,
    jsonb_build_object('slug', v_slug, 'status', v_status, 'html_changed', p ? 'html'));
  return v_id;
end;
$$;

revoke all on function public.save_landing_page(jsonb) from public, anon;
grant execute on function public.save_landing_page(jsonb) to authenticated;

-- p: {variant_id, show_on_landing?, landing_sort?, landing_badge?, short_desc?, gift_text?, image_url?}. Chỉ đổi khóa có
-- trong p. Ảnh tải lên qua máy chủ CRM vào bucket product-images.
create or replace function public.save_landing_product(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
  v_image text := nullif(btrim(coalesce(p ->> 'image_url', '')), '');
begin
  perform public.assert_writer();
  if not (public.has_perm('marketing.manage') or public.has_perm('product.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select product_id into v_product from public.product_variants
  where id = nullif(p ->> 'variant_id', '')::uuid and showroom_id = public.current_showroom_id();
  if v_product is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if length(coalesce(p ->> 'landing_badge', '')) > 40 or length(coalesce(p ->> 'short_desc', '')) > 300
     or length(coalesce(p ->> 'gift_text', '')) > 200 or length(coalesce(v_image, '')) > 1000
     or (v_image is not null and v_image !~ '^https?://') then
    raise exception 'invalid landing product' using errcode = '22023';
  end if;
  update public.products set
    show_on_landing = case when p ? 'show_on_landing' then coalesce((p ->> 'show_on_landing')::boolean, false)
                           else show_on_landing end,
    landing_sort = case when p ? 'landing_sort' then nullif(p ->> 'landing_sort', '')::int else landing_sort end,
    landing_badge = case when p ? 'landing_badge' then nullif(btrim(p ->> 'landing_badge'), '') else landing_badge end,
    short_desc = case when p ? 'short_desc' then nullif(btrim(p ->> 'short_desc'), '') else short_desc end,
    gift_text = case when p ? 'gift_text' then nullif(btrim(p ->> 'gift_text'), '') else gift_text end,
    image_url = case when p ? 'image_url' then v_image else image_url end
  where id = v_product;
  perform public.write_audit('landing.product', 'products', v_product::text, p - 'variant_id');
end;
$$;

revoke all on function public.save_landing_product(jsonb) from public, anon;
grant execute on function public.save_landing_product(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. ingest_lead nhận nguồn landing_page (bản 20261007000800_lead_import.sql). Thêm hai sửa nhỏ:
--    - khách quay lại (đã có lead mở) mà tích đồng ý nhận ưu đãi thì vẫn ghi đồng ý;
--    - ghi chú khách tự gõ trên form (không có người đăng nhập) ghi là của khách, không phải nhân viên.
-- ---------------------------------------------------------------------------

create or replace function public.ingest_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid;
  v_name text := btrim(coalesce(p ->> 'full_name', ''));
  v_country text := coalesce(nullif(p ->> 'country', ''), 'unknown');
  v_source text := coalesce(p ->> 'source', '');
  v_source_key text := nullif(p ->> 'source_key', '');
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_phone jsonb := p -> 'phone';
  v_valid boolean := coalesce((p -> 'phone' ->> 'valid')::boolean, false);
  v_value text;
  v_detail jsonb := coalesce(p -> 'source_detail', '{}'::jsonb);
  v_contact uuid;
  v_lead public.leads;
  v_lead_id uuid;
  v_action text;
  v_route text;
  v_occasion uuid;
  v_budget uuid;
  v_holder text;
begin
  if v_user is not null then
    if (public.active_view_as()).id is not null then
      raise exception 'view-as session is read-only' using errcode = '42501';
    end if;
    if not public.has_perm('lead.create') then
      raise exception 'not allowed to create leads' using errcode = '42501';
    end if;
    -- Nhập file dữ liệu cũ cần thêm quyền lead.import (CLAUDE.md mục 6, nguồn import).
    if v_source = 'import' and not public.has_perm('lead.import') then
      raise exception 'not allowed to import leads' using errcode = '42501';
    end if;
    v_showroom := public.current_showroom_id();
  elsif (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
        or session_user = 'postgres' then
    -- Webhook, job dùng khóa service_role; hoặc chạy thẳng trong database (pg_cron, kiểm thử).
    v_showroom := (p ->> 'showroom_id')::uuid;
  else
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_showroom is null or not exists (select 1 from public.showrooms where id = v_showroom) then
    raise exception 'unknown showroom' using errcode = '22023';
  end if;

  if v_name = '' or length(v_name) > 200 then
    raise exception 'full name is required' using errcode = '22023';
  end if;
  if v_source not in ('meta_lead_ads', 'zalo_oa', 'hotline', 'walk_in', 'tiktok_live', 'referral', 'import', 'manual',
                      'landing_page') then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  if v_source_key is not null and not exists (
    select 1 from public.lead_sources where showroom_id = v_showroom and key = v_source_key and is_active
  ) then
    raise exception 'unknown lead source' using errcode = '22023';
  end if;
  if v_country <> 'unknown' and not exists (
    select 1 from public.markets where showroom_id = v_showroom and country_code = v_country and is_active
  ) then
    raise exception 'unknown market' using errcode = '22023';
  end if;
  if v_phone is null or btrim(coalesce(v_phone ->> 'raw', '')) = '' then
    raise exception 'a phone number is required' using errcode = '22023';
  end if;
  if v_valid and coalesce(v_phone ->> 'e164', '') !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid e164' using errcode = '22023';
  end if;
  -- Số sai vẫn nhận lead nhưng không dùng để chống trùng; lưu kèm tiền tố để không đụng số đúng của người khác.
  v_value := case when v_valid then v_phone ->> 'e164'
                  else 'invalid:' || regexp_replace(v_phone ->> 'raw', '\s', '', 'g') end;

  if nullif(p ->> 'occasion_key', '') is not null then
    select id into v_occasion from public.occasions
    where showroom_id = v_showroom and key = p ->> 'occasion_key' and is_active;
  end if;
  if nullif(p ->> 'budget_key', '') is not null then
    select id into v_budget from public.budget_ranges
    where showroom_id = v_showroom and key = p ->> 'budget_key' and is_active;
  end if;
  if v_source_key is not null then
    v_detail := v_detail || jsonb_build_object('source_key', v_source_key);
  end if;

  -- 1. Tìm khách qua định danh (mục 6, Chống trùng). Số đang dùng chung trong hộ không có định danh riêng nên
  --    không bao giờ làm gộp hai người.
  select ci.contact_id into v_contact
  from public.contact_identities ci
  join public.contacts c on c.id = ci.contact_id and c.deleted_at is null
  where ci.showroom_id = v_showroom and ci.type = 'phone' and ci.value = v_value;

  if v_contact is not null then
    -- 2. Đang có lead mở: không tạo lead mới. 3. Thất bại trong 30 ngày: tạm nối vào lead đó (open-questions).
    --    updated_at được dùng làm mốc đóng lead (xấp xỉ: lead thất bại hiếm khi còn bị sửa).
    select * into v_lead from public.leads
    where contact_id = v_contact and deleted_at is null
      and (stage not in ('won', 'lost') or (stage = 'lost' and updated_at > now() - interval '30 days'))
    order by (stage not in ('won', 'lost')) desc, created_at desc
    limit 1;
    if found then
      perform public.record_event('lead_created', v_showroom, v_contact, v_lead.id,
        jsonb_build_object('source', v_source, 'source_key', v_source_key, 'attached', true));
      perform public.record_event('merge', v_showroom, v_contact, v_lead.id,
        jsonb_build_object('reason', case when v_lead.stage = 'lost' then 'recent_lost_lead' else 'open_lead' end,
                           'matched_by', 'phone'));
      if v_note is not null then
        perform public.record_event('note', v_showroom, v_contact, v_lead.id,
          jsonb_build_object('text', left(v_note, 4000), 'channel', 'crm'),
          case when v_user is null then 'customer' else 'user' end);
      end if;
      -- Khách quay lại qua form và tích đồng ý nhận ưu đãi: vẫn ghi đồng ý dù không sinh lead mới.
      if coalesce((p ->> 'marketing_consent')::boolean, false) then
        insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source, created_by)
        values (v_showroom, v_contact, 'marketing', 'all', true, 'lead:' || v_source, v_user);
      end if;
      -- Nhập file chọn "Cập nhật ô còn trống": chỉ điền ô lead cũ đang trống, không ghi đè.
      if coalesce((p ->> 'fill_empty')::boolean, false) then
        update public.leads
          set recipient_province = coalesce(recipient_province,
                nullif(btrim(coalesce(p ->> 'recipient_province', '')), '')),
              occasion_id = coalesce(occasion_id, v_occasion),
              budget_range_id = coalesce(budget_range_id, v_budget),
              source_detail = (v_detail - 'source_key') || source_detail
          where id = v_lead.id;
      end if;
      if v_lead.assigned_to is not null then
        insert into public.notifications (showroom_id, user_id, type, title, link)
        values (v_showroom, v_lead.assigned_to, 'lead_reentry',
                'Khách anh chị đang giữ vừa liên hệ lại qua nguồn mới', '/leads/' || v_lead.id);
        select full_name into v_holder from public.profiles where id = v_lead.assigned_to;
      else
        perform public.notify_lead_assigners(v_showroom, v_lead.id, 'Khách ở hàng Chưa phân vừa liên hệ lại');
      end if;
      if v_user is not null then
        perform public.write_audit('lead.attach', 'leads', v_lead.id::text,
          jsonb_build_object('source', v_source, 'source_key', v_source_key));
      end if;
      return jsonb_build_object('action', 'attached', 'lead_id', v_lead.id, 'contact_id', v_contact,
                                'holder_name', v_holder);
    end if;
    v_action := 'new_lead_existing_contact';
    if v_country <> 'unknown' then
      update public.contacts set country_of_residence = v_country
      where id = v_contact and country_of_residence = 'unknown';
    end if;
    perform public.record_event('merge', v_showroom, v_contact, null,
      jsonb_build_object('reason', 'returning_customer', 'matched_by', 'phone'));
  else
    v_action := 'created';
    insert into public.contacts (showroom_id, full_name, country_of_residence, lifecycle_stage, created_by)
    values (v_showroom, v_name, v_country, 'lead', v_user)
    returning id into v_contact;
    insert into public.contact_identities
      (showroom_id, contact_id, type, value, value_raw, display_masked, is_primary, is_valid, source, created_by)
    values (v_showroom, v_contact, 'phone', v_value, v_phone ->> 'raw',
            coalesce(nullif(v_phone ->> 'masked', ''), '••••••'), true, v_valid, v_source, v_user);
  end if;

  if coalesce((p ->> 'marketing_consent')::boolean, false) then
    insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source, created_by)
    values (v_showroom, v_contact, 'marketing', 'all', true, 'lead:' || v_source, v_user);
  end if;

  insert into public.leads (showroom_id, contact_id, source, source_detail, occasion_id, budget_range_id,
                            recipient_province, flags, created_by)
  values (v_showroom, v_contact, v_source, v_detail, v_occasion, v_budget,
          nullif(btrim(coalesce(p ->> 'recipient_province', '')), ''),
          case when v_valid then '{}'::text[] else array['phone_invalid'] end, v_user)
  returning id into v_lead_id;

  if v_note is not null then
    perform public.record_event('note', v_showroom, v_contact, v_lead_id,
      jsonb_build_object('text', left(v_note, 4000), 'channel', 'crm'),
      case when v_user is null then 'customer' else 'user' end);
  end if;
  if not v_valid then
    -- Mục 6: số không hợp lệ vào hàng chờ sale admin kiểm tra.
    insert into public.tasks (showroom_id, type, title, contact_id, lead_id, due_at, priority, source, rule_key)
    values (v_showroom, 'data_fix', 'Kiểm tra số điện thoại không hợp lệ', v_contact, v_lead_id, now(), 1,
            'rule', 'phone_invalid');
  end if;
  if v_user is not null then
    perform public.write_audit('lead.create', 'leads', v_lead_id::text,
      jsonb_build_object('source', v_source, 'source_key', v_source_key, 'action', v_action));
  end if;

  -- Nhập file dữ liệu cũ mặc định để ở hàng "Chưa phân" (route = false): không đổ hàng trăm lead cũ cho telesale
  -- cùng lúc kèm SLA 5 phút; sale admin chia sau.
  if coalesce((p ->> 'route')::boolean, true) then
    v_route := public.route_lead(v_lead_id);
  else
    v_route := 'held';
  end if;
  select p2.full_name into v_holder
  from public.leads l join public.profiles p2 on p2.id = l.assigned_to where l.id = v_lead_id;

  return jsonb_build_object('action', v_action, 'lead_id', v_lead_id, 'contact_id', v_contact,
                            'route', v_route, 'holder_name', v_holder,
                            'wait_until', (select window_wait_until from public.leads where id = v_lead_id));
end;
$$;

revoke all on function public.ingest_lead(jsonb) from public, anon;
grant execute on function public.ingest_lead(jsonb) to authenticated, service_role;
