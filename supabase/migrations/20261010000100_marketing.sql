-- Phòng Marketing (duyệt 10/10/2026): vai trò Marketing, quyền marketing.*, chiến dịch, chi phí quảng cáo theo ngày,
-- duyệt ngân sách chiến dịch qua hàng chờ duyệt dùng chung (chỉ Owner duyệt), số liệu tổng hợp theo chiến dịch và nguồn.
--
-- Marketing chỉ thấy số tổng hợp (số lead, đã liên hệ, đặt cọc, chi phí): không đọc được lead từng người, số điện
-- thoại hay giá vốn (CLAUDE.md mục 5). Tiền lưu bigint đơn vị đồng.

-- ---------------------------------------------------------------------------
-- Vai trò và quyền
-- ---------------------------------------------------------------------------

insert into public.roles (showroom_id, key, name, is_system, is_owner)
select id, 'marketing', 'Marketing', true, false from public.showrooms
on conflict (showroom_id, key) do nothing;

-- Chỉ thêm quyền mới và mặc định của vai trò mới, không chạy lại cả khối (sẽ bật lại quyền Owner đã tắt).
-- Các dòng khớp kết quả của scripts/gen-permission-seed.mts (tests/unit/permissions.test.ts kiểm).
insert into public.permissions (key, "group", description, grantable, sensitive) values
  ('marketing.view', 'Marketing', 'Xem tổng quan marketing, chiến dịch, chi phí, hiệu quả theo nguồn', true, false),
  ('marketing.manage', 'Marketing', 'Tạo, sửa chiến dịch; nhập chi phí quảng cáo', true, false),
  ('marketing.budget_approve', 'Marketing', 'Duyệt ngân sách chiến dịch', true, true)
on conflict (key) do update set "group" = excluded."group", description = excluded.description,
  grantable = excluded.grantable, sensitive = excluded.sensitive;

insert into public.role_permissions (role_id, permission_key)
select r.id, v.permission_key from (values
  ('owner', 'marketing.view'),
  ('sale_admin', 'marketing.view'),
  ('marketing', 'marketing.view'),
  ('owner', 'marketing.manage'),
  ('marketing', 'marketing.manage'),
  ('owner', 'marketing.budget_approve'),
  ('marketing', 'catalog.view'),
  ('marketing', 'product.view'),
  ('marketing', 'policy.view'),
  ('marketing', 'kpi.own'),
  ('marketing', 'report.own')
) as v (role_key, permission_key)
join public.roles r on r.key = v.role_key
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Chiến dịch, chi phí
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  platform text not null check (platform in ('facebook', 'tiktok', 'zalo', 'google', 'koc', 'offline', 'other')),
  -- Mã chiến dịch trên nền tảng quảng cáo: khớp source_detail.campaign_id của lead (Form Facebook) để gắn lead.
  external_id text check (external_id is null or external_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  -- Thị trường người xem quảng cáo (mã trong markets), null là mọi thị trường.
  market text,
  starts_on date,
  ends_on date,
  -- Ngân sách đã duyệt; requested_budget là mức đang chờ Owner duyệt.
  budget bigint not null default 0 check (budget >= 0),
  requested_budget bigint check (requested_budget is null or requested_budget > 0),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'active', 'paused', 'ended', 'rejected')),
  owner_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index campaigns_external_idx on public.campaigns (showroom_id, platform, external_id)
  where external_id is not null and deleted_at is null;

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.campaign_spend (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  spend_date date not null,
  amount bigint not null check (amount >= 0),
  source text not null default 'manual' check (source in ('manual', 'csv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (campaign_id, spend_date)
);

create trigger campaign_spend_updated_at before update on public.campaign_spend
  for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;
alter table public.campaign_spend enable row level security;

create policy campaigns_select on public.campaigns for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null and public.has_perm('marketing.view'));
create policy campaign_spend_select on public.campaign_spend for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('marketing.view'));

-- Ghi chỉ qua các hàm bên dưới (kiểm quyền, ngân sách, nhật ký).
revoke insert, update, delete on public.campaigns, public.campaign_spend from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Duyệt ngân sách qua hàng chờ duyệt dùng chung
-- ---------------------------------------------------------------------------

alter table public.approvals drop constraint approvals_type_check;
alter table public.approvals add constraint approvals_type_check
  check (type in ('discount', 'payment_confirm', 'stock_count', 'ai_proposal', 'campaign_budget'));

create or replace function public.approval_permission(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'discount' then 'order.discount_approve'
    when 'payment_confirm' then 'payment.confirm'
    when 'stock_count' then 'inventory.count_approve'
    when 'ai_proposal' then 'settings.permissions'
    when 'campaign_budget' then 'marketing.budget_approve'
  end;
$$;

-- Hệ thống tự hết hạn đề xuất cũ khi có đề xuất mới (người xin không có quyền duyệt): bật app.approval_system trong
-- giao dịch của hàm gọi. Người dùng không tự bật được cờ này vì PostgREST không mở set_config.
create or replace function public.guard_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'approval already decided' using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and current_setting('app.approval_system', true) is distinct from 'on' then
      if not public.has_perm(public.approval_permission(new.type)) then
        raise exception 'not allowed to decide this approval' using errcode = 'insufficient_privilege';
      end if;
      if old.requested_by = auth.uid() and not public.is_owner_user(auth.uid()) then
        raise exception 'cannot approve your own request' using errcode = 'insufficient_privilege';
      end if;
      new.decided_by := auth.uid();
    end if;
    new.decided_at := now();
    perform public.write_audit('approval.' || new.status, 'approvals', new.id::text,
      jsonb_build_object('type', new.type, 'entity', new.entity, 'entity_id', new.entity_id,
        'self_approved', old.requested_by = auth.uid(), 'showroom_id', new.showroom_id));
  end if;
  return new;
end;
$$;

-- Hết hạn các đề xuất ngân sách đang chờ của một chiến dịch (khi có mức mới).
create or replace function public.expire_campaign_budget_requests(p_campaign uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.approval_system', 'on', true);
  update public.approvals set status = 'expired', decision_note = p_note
  where type = 'campaign_budget' and entity_id = p_campaign and status = 'pending';
  perform set_config('app.approval_system', '', true);
end;
$$;

revoke all on function public.expire_campaign_budget_requests(uuid, text) from public, anon, authenticated;

-- Người gọi được sửa chiến dịch: đăng nhập thật, không "xem như", có marketing.manage.
create or replace function public.assert_marketing_writer()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('marketing.manage') then
    raise exception 'not allowed to manage campaigns' using errcode = '42501';
  end if;
  return public.current_showroom_id();
end;
$$;

revoke all on function public.assert_marketing_writer() from public, anon, authenticated;

-- Xin ngân sách (mức mới cao hơn mức đã duyệt). Người có marketing.budget_approve (Owner) thì áp ngay, ghi nhật ký
-- tự duyệt; người khác thì vào hàng chờ duyệt và chờ Owner. Giảm ngân sách không cần duyệt.
create or replace function public.request_campaign_budget(p_campaign uuid, p_amount bigint, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
  v_c public.campaigns;
begin
  select * into v_c from public.campaigns
  where id = p_campaign and showroom_id = v_showroom and deleted_at is null
  for update;
  if not found then
    raise exception 'campaign not found' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000000 then
    raise exception 'invalid budget' using errcode = '22023';
  end if;

  if p_amount <= v_c.budget or public.has_perm('marketing.budget_approve') then
    -- Hủy đề xuất cũ đang chờ (nếu có) vì mức mới đã áp.
    perform public.expire_campaign_budget_requests(v_c.id, 'Thay bằng mức ngân sách mới');
    update public.campaigns
      set budget = p_amount, requested_budget = null,
          status = case when status in ('pending_approval', 'rejected') and p_amount > 0 then 'active' else status end
      where id = v_c.id;
    perform public.write_audit('campaign.budget_set', 'campaigns', v_c.id::text,
      jsonb_build_object('before', v_c.budget, 'after', p_amount,
                         'self_approved', p_amount > v_c.budget));
    return 'applied';
  end if;

  perform public.expire_campaign_budget_requests(v_c.id, 'Thay bằng đề xuất mới');
  insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
  values (v_showroom, 'campaign_budget', 'campaigns', v_c.id, auth.uid(),
          left(coalesce(nullif(btrim(p_reason), ''),
                        'Ngân sách chiến dịch ' || v_c.name || ': ' || to_char(p_amount, 'FM999G999G999G999') || ' đ'),
               500),
          jsonb_build_object('amount', p_amount, 'before', v_c.budget, 'campaign', v_c.name));
  update public.campaigns set requested_budget = p_amount where id = v_c.id;

  insert into public.notifications (showroom_id, user_id, type, title, link)
  select pr.showroom_id, pr.id, 'approval_request', 'Có ngân sách chiến dịch chờ duyệt', '/tasks'
  from public.profiles pr
  where pr.showroom_id = v_showroom and pr.is_active and pr.id <> auth.uid()
    and public.has_perm_for(pr.id, 'marketing.budget_approve');
  return 'pending';
end;
$$;

revoke all on function public.request_campaign_budget(uuid, bigint, text) from public, anon;
grant execute on function public.request_campaign_budget(uuid, bigint, text) to authenticated;

-- Quyết định duyệt (trigger trên approvals, sau guard_approval_decision): áp ngân sách hoặc trả lại, báo người xin.
create or replace function public.apply_campaign_budget_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint := (new.payload ->> 'amount')::bigint;
begin
  if new.type <> 'campaign_budget' or new.status = old.status or old.status <> 'pending' then
    return null;
  end if;
  if new.status = 'approved' then
    update public.campaigns
      set budget = v_amount, requested_budget = null,
          status = case when status in ('pending_approval', 'rejected') then 'active' else status end
      where id = new.entity_id;
  elsif new.status = 'rejected' then
    update public.campaigns
      set requested_budget = null,
          status = case when status = 'pending_approval' and budget = 0 then 'rejected' else status end
      where id = new.entity_id;
  end if;
  if new.status in ('approved', 'rejected') and new.requested_by is not null then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (new.showroom_id, new.requested_by, 'approval_decided',
            case when new.status = 'approved' then 'Ngân sách chiến dịch đã được duyệt'
                 else 'Ngân sách chiến dịch bị từ chối' end,
            '/marketing/campaigns');
  end if;
  return null;
end;
$$;

create trigger approvals_campaign_budget after update on public.approvals
  for each row execute function public.apply_campaign_budget_decision();

-- ---------------------------------------------------------------------------
-- Tạo, sửa chiến dịch; ghi chi phí
-- ---------------------------------------------------------------------------

-- p: { id?, name, platform, external_id?, market?, starts_on?, ends_on?, owner_id?, note?, status?, budget? }
-- Tạo mới: ngân sách đi qua request_campaign_budget (chờ Owner duyệt nếu người tạo không có quyền duyệt).
-- Sửa: không đổi ngân sách ở đây; trạng thái chỉ đổi giữa đang chạy, tạm dừng, kết thúc khi đã có ngân sách duyệt.
create or replace function public.save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_old public.campaigns;
  v_status text := nullif(p ->> 'status', '');
  v_market text := nullif(p ->> 'market', '');
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
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

  if v_id is null then
    insert into public.campaigns (showroom_id, name, platform, external_id, market, starts_on, ends_on, owner_id, note,
                                  created_by)
    values (v_showroom, btrim(p ->> 'name'), p ->> 'platform', nullif(btrim(p ->> 'external_id'), ''), v_market,
            nullif(p ->> 'starts_on', '')::date, nullif(p ->> 'ends_on', '')::date,
            coalesce(v_owner, auth.uid()), nullif(btrim(coalesce(p ->> 'note', '')), ''), auth.uid())
    returning id into v_id;
    perform public.write_audit('campaign.create', 'campaigns', v_id::text,
      jsonb_build_object('name', btrim(p ->> 'name'), 'platform', p ->> 'platform'));
    if coalesce((p ->> 'budget')::bigint, 0) > 0 then
      perform public.request_campaign_budget(v_id, (p ->> 'budget')::bigint, nullif(p ->> 'reason', ''));
    end if;
    return v_id;
  end if;

  select * into v_old from public.campaigns
  where id = v_id and showroom_id = v_showroom and deleted_at is null
  for update;
  if not found then
    raise exception 'campaign not found' using errcode = 'no_data_found';
  end if;
  if v_status is not null and v_status is distinct from v_old.status then
    if v_status not in ('active', 'paused', 'ended') then
      raise exception 'invalid status' using errcode = '22023';
    end if;
    if v_status = 'active' and v_old.budget = 0 then
      raise exception 'budget_not_approved' using errcode = 'P0001';
    end if;
  end if;
  update public.campaigns
    set name = btrim(p ->> 'name'),
        platform = p ->> 'platform',
        external_id = nullif(btrim(p ->> 'external_id'), ''),
        market = v_market,
        starts_on = nullif(p ->> 'starts_on', '')::date,
        ends_on = nullif(p ->> 'ends_on', '')::date,
        owner_id = coalesce(v_owner, owner_id),
        note = nullif(btrim(coalesce(p ->> 'note', '')), ''),
        status = coalesce(v_status, status)
    where id = v_id;
  perform public.write_audit('campaign.update', 'campaigns', v_id::text,
    jsonb_build_object('before', jsonb_build_object('name', v_old.name, 'status', v_old.status),
                       'after', jsonb_build_object('name', btrim(p ->> 'name'), 'status', coalesce(v_status, v_old.status))));
  return v_id;
end;
$$;

revoke all on function public.save_campaign(jsonb) from public, anon;
grant execute on function public.save_campaign(jsonb) to authenticated;

-- Ghi chi phí theo ngày (ghi đè ngày đã có). p_rows: [{ campaign_id, date, amount }]; source 'manual' | 'csv'.
-- Trả về số dòng đã ghi.
create or replace function public.record_campaign_spend(p_rows jsonb, p_source text default 'manual')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_marketing_writer();
  r jsonb;
  v_n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 2000 then
    raise exception 'between 1 and 2000 rows' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'csv') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not exists (
      select 1 from public.campaigns
      where id = (r ->> 'campaign_id')::uuid and showroom_id = v_showroom and deleted_at is null
    ) then
      raise exception 'campaign not found' using errcode = 'no_data_found';
    end if;
    if (r ->> 'amount')::bigint < 0 or (r ->> 'amount')::bigint > 10000000000 then
      raise exception 'invalid amount' using errcode = '22023';
    end if;
    insert into public.campaign_spend (showroom_id, campaign_id, spend_date, amount, source, created_by)
    values (v_showroom, (r ->> 'campaign_id')::uuid, (r ->> 'date')::date, (r ->> 'amount')::bigint, p_source,
            auth.uid())
    on conflict (campaign_id, spend_date)
      do update set amount = excluded.amount, source = excluded.source, created_by = excluded.created_by;
    v_n := v_n + 1;
  end loop;
  perform public.write_audit('campaign.spend', 'campaign_spend', null,
    jsonb_build_object('count', v_n, 'source', p_source));
  return v_n;
end;
$$;

revoke all on function public.record_campaign_spend(jsonb, text) from public, anon;
grant execute on function public.record_campaign_spend(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Số liệu tổng hợp (không trả thông tin khách)
-- ---------------------------------------------------------------------------

-- Theo lô lead (CLAUDE.md 9.4): lead nhận trong khoảng ngày (giờ VN), theo dõi kết quả đến nay.
-- kind 'campaign': lead có source_detail.campaign_id khớp mã chiến dịch; kind 'source': mọi lead theo nguồn;
-- kind 'market': theo thị trường của khách. Chi phí: tổng chi phí trong khoảng ngày của chiến dịch (hoặc nguồn
-- tương ứng với nền tảng của chiến dịch).
create or replace function public.marketing_overview(p_from date, p_to date)
returns table (
  kind text, key text, label text, leads bigint, contacted bigint, converted bigint, lost bigint,
  spend bigint, budget bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.current_showroom_id();
  v_start timestamptz := (p_from::timestamp) at time zone 'Asia/Ho_Chi_Minh';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Asia/Ho_Chi_Minh';
begin
  if not public.has_perm('marketing.view') then
    raise exception 'not allowed to view marketing' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid range' using errcode = '22023';
  end if;

  return query
  with l as (
    select le.id, le.source, le.stage, le.first_contact_at, le.source_detail ->> 'campaign_id' as campaign_ext,
           c.country_of_residence as market
    from public.leads le
    join public.contacts c on c.id = le.contact_id
    where le.showroom_id = v_showroom and le.deleted_at is null
      and le.created_at >= v_start and le.created_at < v_end
  ),
  sp as (
    select s.campaign_id, sum(s.amount)::bigint as amount
    from public.campaign_spend s
    where s.showroom_id = v_showroom and s.spend_date between p_from and p_to
    group by s.campaign_id
  )
  select 'campaign'::text, cp.id::text, cp.name,
         count(l.id), count(l.id) filter (where l.first_contact_at is not null),
         count(l.id) filter (where l.stage in ('deposit', 'won')),
         count(l.id) filter (where l.stage = 'lost'),
         coalesce(max(sp.amount), 0)::bigint, cp.budget
  from public.campaigns cp
  left join l on cp.external_id is not null and l.campaign_ext = cp.external_id
  left join sp on sp.campaign_id = cp.id
  where cp.showroom_id = v_showroom and cp.deleted_at is null
  group by cp.id, cp.name, cp.budget
  union all
  select 'source'::text, l.source, l.source,
         count(*), count(*) filter (where l.first_contact_at is not null),
         count(*) filter (where l.stage in ('deposit', 'won')),
         count(*) filter (where l.stage = 'lost'),
         0::bigint, 0::bigint
  from l
  group by l.source
  union all
  select 'market'::text, l.market, l.market,
         count(*), count(*) filter (where l.first_contact_at is not null),
         count(*) filter (where l.stage in ('deposit', 'won')),
         count(*) filter (where l.stage = 'lost'),
         0::bigint, 0::bigint
  from l
  group by l.market;
end;
$$;

revoke all on function public.marketing_overview(date, date) from public, anon;
grant execute on function public.marketing_overview(date, date) to authenticated;
