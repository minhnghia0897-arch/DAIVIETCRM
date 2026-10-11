-- Bán hàng đợt 5 (11/10/2026, anh duyệt kế hoạch 5 đợt): combo, chính sách có phiên bản, báo giá có link công khai,
-- và đường ghi đơn, báo giá đã định giá bằng hàm định giá dùng chung lib/sales/pricing.ts (CLAUDE.md 8.5).
--
-- Định giá chạy ở server Next (hàm thuần, cùng hàm với màn Thử chính sách); kết quả được ghi bằng các hàm persist_*
-- chỉ mở cho service_role. Hàm nhận người thao tác (p_actor) và tự kiểm quyền, lead, thông tin bắt buộc theo người đó,
-- nên server không thể ghi hộ việc người dùng không được làm. Người dùng không gọi thẳng được để tự đặt giá.

-- ---------------------------------------------------------------------------
-- Combo
-- ---------------------------------------------------------------------------

create table public.combos (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null check (length(btrim(code)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  pricing_mode text not null check (pricing_mode in ('fixed_price', 'sum_minus')),
  price bigint check (price is null or price >= 0),
  discount bigint check (discount is null or discount >= 0),
  valid_from date,
  valid_to date,
  channels text[],
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, code),
  check (pricing_mode <> 'fixed_price' or price is not null),
  check (pricing_mode <> 'sum_minus' or discount is not null)
);

create trigger combos_updated_at before update on public.combos
  for each row execute function public.set_updated_at();

create table public.combo_items (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  combo_id uuid not null references public.combos (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  qty int not null check (qty between 1 and 99),
  is_gift boolean not null default false
);

create index combo_items_combo_idx on public.combo_items (combo_id);

alter table public.combos enable row level security;
alter table public.combo_items enable row level security;
create policy combos_select on public.combos for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));
create policy combo_items_select on public.combo_items for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));
revoke insert, update, delete on public.combos, public.combo_items from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Chính sách: mỗi lần sửa chính sách đang chạy là một phiên bản mới (policy_key giữ nguyên), đơn cũ giữ phiên bản
-- đã áp. rules kiểm bằng schema zod theo loại ở server (lib/sales/policy-rules.ts).
-- ---------------------------------------------------------------------------

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  policy_key uuid not null default gen_random_uuid(),
  version int not null default 1,
  is_current boolean not null default true,
  type text not null check (type in ('promotion', 'delivery', 'deposit', 'payment', 'warranty', 'return',
                                     'discount_limit')),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'expired')),
  valid_from date not null,
  valid_to date,
  channels text[],
  priority int not null default 0,
  stackable boolean not null default false,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (policy_key, version)
);

create unique index policies_current_idx on public.policies (policy_key) where is_current;

alter table public.policies enable row level security;
create policy policies_select on public.policies for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('policy.view') or public.has_perm('quote.create') or public.has_perm('order.create')));
revoke insert, update, delete on public.policies from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Báo giá
-- ---------------------------------------------------------------------------

create table public.quote_counters (
  showroom_id uuid not null references public.showrooms (id),
  period text not null,
  last_no int not null default 0,
  primary key (showroom_id, period)
);

alter table public.quote_counters enable row level security;
revoke all on public.quote_counters from authenticated, anon;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null,
  -- Link công khai /q/<token>: mã ngẫu nhiên khó đoán.
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  lead_id uuid not null references public.leads (id),
  buyer_contact_id uuid not null references public.contacts (id),
  recipient_contact_id uuid references public.contacts (id),
  address_id uuid references public.contact_addresses (id),
  ship_province text,
  seller_id uuid references public.profiles (id),
  status text not null default 'sent' check (status in ('draft', 'sent', 'viewed', 'accepted', 'expired', 'rejected')),
  valid_until timestamptz not null,
  -- Đầu vào để định giá lại khi khách đồng ý: dòng, giảm tay, phí nhập tay.
  input jsonb not null,
  -- Kết quả hàm định giá lúc gửi (chụp lại để hiện cho khách).
  pricing jsonb not null,
  subtotal bigint not null,
  discount bigint not null,
  fees bigint not null,
  total bigint not null,
  deposit_min bigint not null,
  gift_message text,
  note text,
  order_id uuid references public.orders (id),
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, code)
);

create index quotes_lead_idx on public.quotes (lead_id);

create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  combo_id uuid references public.combos (id),
  name text not null,
  qty int not null check (qty > 0),
  unit_price bigint not null,
  discount bigint not null default 0,
  line_total bigint not null,
  is_gift boolean not null default false
);

create index quote_items_quote_idx on public.quote_items (quote_id);

-- Người xem được báo giá: người xem được lead của báo giá.
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
create policy quotes_select on public.quotes for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.can_view_lead(lead_id));
create policy quote_items_select on public.quote_items for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_items.quote_id));
revoke insert, update, delete on public.quotes, public.quote_items from authenticated, anon;

create table public.order_policy_applications (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  policy_id uuid not null references public.policies (id),
  policy_version int not null,
  type text not null,
  name text not null,
  benefit text
);

create index order_policy_applications_order_idx on public.order_policy_applications (order_id);

alter table public.order_policy_applications enable row level security;
create policy order_policy_applications_select on public.order_policy_applications for select to authenticated
  using (public.can_view_order(order_id));
revoke insert, update, delete on public.order_policy_applications from authenticated, anon;

alter table public.order_items add constraint order_items_combo_fk foreign key (combo_id) references public.combos (id);
alter table public.orders add constraint orders_quote_fk foreign key (quote_id) references public.quotes (id);

-- ---------------------------------------------------------------------------
-- Hàm quản lý combo, chính sách (người dùng gọi, kiểm quyền)
-- ---------------------------------------------------------------------------

-- p: {id?, code, name, description?, pricing_mode, price?, discount?, valid_from?, valid_to?, status?,
--     items: [{variant_id, qty, is_gift}]}
create or replace function public.save_combo(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  i jsonb;
begin
  if not public.has_perm('combo.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0
     or jsonb_array_length(p -> 'items') > 20 then
    raise exception 'invalid combo' using errcode = '22023';
  end if;
  if exists (select 1 from public.combos where showroom_id = v_showroom and code = upper(btrim(p ->> 'code'))
               and id is distinct from v_id) then
    raise exception 'code_taken' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.combos (showroom_id, code, name, pricing_mode, price, discount, created_by)
    values (v_showroom, upper(btrim(p ->> 'code')), btrim(p ->> 'name'), p ->> 'pricing_mode',
            case when p ->> 'pricing_mode' = 'fixed_price' then (p ->> 'price')::bigint end,
            case when p ->> 'pricing_mode' = 'sum_minus' then (p ->> 'discount')::bigint end, v_user)
    returning id into v_id;
  elsif not exists (select 1 from public.combos where id = v_id and showroom_id = v_showroom) then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;
  update public.combos set
    code = upper(btrim(p ->> 'code')),
    name = btrim(p ->> 'name'),
    description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
    pricing_mode = p ->> 'pricing_mode',
    price = case when p ->> 'pricing_mode' = 'fixed_price' then (p ->> 'price')::bigint end,
    discount = case when p ->> 'pricing_mode' = 'sum_minus' then (p ->> 'discount')::bigint end,
    valid_from = nullif(p ->> 'valid_from', '')::date,
    valid_to = nullif(p ->> 'valid_to', '')::date,
    status = coalesce(p ->> 'status', status)
  where id = v_id;
  delete from public.combo_items where combo_id = v_id;
  for i in select * from jsonb_array_elements(p -> 'items') loop
    if not exists (select 1 from public.product_variants where id = (i ->> 'variant_id')::uuid
                     and showroom_id = v_showroom) then
      raise exception 'invalid combo' using errcode = '22023';
    end if;
    insert into public.combo_items (showroom_id, combo_id, variant_id, qty, is_gift)
    values (v_showroom, v_id, (i ->> 'variant_id')::uuid, (i ->> 'qty')::int, coalesce((i ->> 'is_gift')::boolean, false));
  end loop;
  perform public.write_audit('combo.save', 'combos', v_id::text, jsonb_build_object('code', p ->> 'code'));
  return v_id;
end;
$$;

revoke all on function public.save_combo(jsonb) from public, anon;
grant execute on function public.save_combo(jsonb) to authenticated;

-- p: {policy_key?, type, name, status, valid_from, valid_to?, channels?, priority, stackable, rules}
-- Chính sách nháp sửa tại chỗ; chính sách đã từng chạy (không phải nháp) thì tạo phiên bản mới.
create or replace function public.save_policy(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_key uuid := nullif(p ->> 'policy_key', '')::uuid;
  v_cur public.policies;
  v_id uuid;
begin
  if not public.has_perm('policy.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p ->> 'status', 'draft') not in ('draft', 'active', 'paused', 'expired')
     or (p ->> 'valid_from') is null or jsonb_typeof(p -> 'rules') <> 'object' then
    raise exception 'invalid policy' using errcode = '22023';
  end if;
  if v_key is not null then
    select * into v_cur from public.policies where policy_key = v_key and is_current and showroom_id = v_showroom
    for update;
    if not found then
      raise exception 'policy not found' using errcode = 'P0002';
    end if;
  end if;
  if v_key is not null and v_cur.status = 'draft' and v_cur.version = 1
     and not exists (select 1 from public.order_policy_applications where policy_id = v_cur.id) then
    update public.policies set
      type = p ->> 'type', name = btrim(p ->> 'name'), status = coalesce(p ->> 'status', 'draft'),
      valid_from = (p ->> 'valid_from')::date, valid_to = nullif(p ->> 'valid_to', '')::date,
      channels = case when jsonb_typeof(p -> 'channels') = 'array'
                      then array(select jsonb_array_elements_text(p -> 'channels')) end,
      priority = coalesce((p ->> 'priority')::int, 0), stackable = coalesce((p ->> 'stackable')::boolean, false),
      rules = p -> 'rules'
    where id = v_cur.id
    returning id into v_id;
  else
    if v_key is not null then
      update public.policies set is_current = false where id = v_cur.id;
    end if;
    insert into public.policies (showroom_id, policy_key, version, type, name, status, valid_from, valid_to, channels,
                                 priority, stackable, rules, created_by)
    values (v_showroom, coalesce(v_key, gen_random_uuid()), coalesce(v_cur.version, 0) + 1, p ->> 'type',
            btrim(p ->> 'name'), coalesce(p ->> 'status', 'draft'), (p ->> 'valid_from')::date,
            nullif(p ->> 'valid_to', '')::date,
            case when jsonb_typeof(p -> 'channels') = 'array'
                 then array(select jsonb_array_elements_text(p -> 'channels')) end,
            coalesce((p ->> 'priority')::int, 0), coalesce((p ->> 'stackable')::boolean, false), p -> 'rules', v_user)
    returning id into v_id;
  end if;
  perform public.write_audit('policy.save', 'policies', v_id::text,
    jsonb_build_object('type', p ->> 'type', 'status', p ->> 'status'));
  return v_id;
end;
$$;

revoke all on function public.save_policy(jsonb) from public, anon;
grant execute on function public.save_policy(jsonb) to authenticated;

-- Bật, tạm dừng, kết thúc chính sách (không tạo phiên bản mới vì nội dung không đổi).
create or replace function public.set_policy_status(p_policy_key uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_writer();
  if not public.has_perm('policy.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'expired') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.policies set status = p_status
  where policy_key = p_policy_key and is_current and showroom_id = public.current_showroom_id();
  if not found then
    raise exception 'policy not found' using errcode = 'P0002';
  end if;
  perform public.write_audit('policy.status', 'policies', p_policy_key::text, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.set_policy_status(uuid, text) from public, anon;
grant execute on function public.set_policy_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ghi báo giá, đơn đã định giá (chỉ service_role; server Next gọi sau khi tự định giá)
-- ---------------------------------------------------------------------------

-- Kiểm người thao tác: đang hoạt động, có quyền, xem được lead (giữ lead hoặc lead.view_all), lead đủ bốn thông tin,
-- địa chỉ thuộc người đặt hoặc người nhận. Trả về lead.
create or replace function public.assert_actor_lead(p_actor uuid, p_lead_id uuid, p_perm text, p_address_id uuid)
returns public.leads
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_showroom uuid;
  v_lead public.leads;
begin
  select showroom_id into v_showroom from public.profiles where id = p_actor and is_active;
  if v_showroom is null or not public.has_perm_for(p_actor, p_perm) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_lead from public.leads
  where id = p_lead_id and deleted_at is null and showroom_id = v_showroom
    and (public.has_perm_for(p_actor, 'lead.view_all')
         or (public.has_perm_for(p_actor, 'lead.view_own') and assigned_to = p_actor));
  if not found then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;
  if v_lead.recipient_contact_id is null or v_lead.recipient_province is null
     or v_lead.occasion_id is null or v_lead.budget_range_id is null then
    raise exception 'missing_required_info' using errcode = 'P0001';
  end if;
  if v_lead.stage = 'lost' then
    raise exception 'lead_lost' using errcode = 'P0001';
  end if;
  if p_address_id is not null and not exists (
      select 1 from public.contact_addresses where id = p_address_id and deleted_at is null
        and contact_id in (v_lead.contact_id, v_lead.recipient_contact_id)) then
    raise exception 'address_required' using errcode = 'P0001';
  end if;
  return v_lead;
end;
$$;

revoke all on function public.assert_actor_lead(uuid, uuid, text, uuid) from public, anon, authenticated;

-- Kiểm số học của kết quả định giá: tổng các dòng, tổng đơn khớp nhau, không âm.
create or replace function public.check_priced(p jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum bigint;
  v_disc bigint;
begin
  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0
     or jsonb_array_length(p -> 'lines') > 80 then
    raise exception 'invalid pricing' using errcode = '22023';
  end if;
  select coalesce(sum((l ->> 'total')::bigint), 0), coalesce(sum((l ->> 'discount')::bigint), 0)
    into v_sum, v_disc
  from jsonb_array_elements(p -> 'lines') l;
  if exists (select 1 from jsonb_array_elements(p -> 'lines') l
             where (l ->> 'qty')::int < 1 or (l ->> 'total')::bigint < 0 or (l ->> 'discount')::bigint < 0
                or (l ->> 'unit_price')::bigint < 0) then
    raise exception 'invalid pricing' using errcode = '22023';
  end if;
  if v_sum <> (p ->> 'subtotal')::bigint - (p ->> 'discount')::bigint or v_disc <> (p ->> 'discount')::bigint
     or (p ->> 'total')::bigint <> v_sum + (p ->> 'delivery_fee')::bigint + (p ->> 'installation_fee')::bigint
     or (p ->> 'delivery_fee')::bigint < 0 or (p ->> 'installation_fee')::bigint < 0
     or (p ->> 'deposit_min')::bigint < 0 or (p ->> 'deposit_min')::bigint > (p ->> 'total')::bigint then
    raise exception 'invalid pricing' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.check_priced(jsonb) from public, anon, authenticated;

-- p: {lead_id, address_id, lines: [{variant_id, combo_id?, name, qty, unit_price, discount, total, is_gift}],
--     subtotal, discount, delivery_fee, installation_fee, total, deposit_min, applied: [{id, version, type, name,
--     benefit}], approvals: [text], note?, gift_message?, channel?, quote_id?, by_customer?}
-- Có quote_id: báo giá phải còn hiệu lực, được đánh dấu đã đồng ý và gắn đơn trong cùng giao dịch.
create or replace function public.persist_priced_order(p_actor uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_addr public.contact_addresses;
  v_showroom uuid;
  v_period text;
  v_no int;
  v_code text;
  v_order uuid;
  v_status text;
  v_owner boolean := public.is_owner_user(p_actor);
  v_reason text;
  v_quote public.quotes;
  v_by_customer boolean := coalesce((p ->> 'by_customer')::boolean, false);
  l jsonb;
  a jsonb;
begin
  v_lead := public.assert_actor_lead(p_actor, (p ->> 'lead_id')::uuid, 'order.create', (p ->> 'address_id')::uuid);
  v_showroom := v_lead.showroom_id;
  perform public.check_priced(p);
  select * into v_addr from public.contact_addresses where id = (p ->> 'address_id')::uuid;
  if not found then
    raise exception 'address_required' using errcode = 'P0001';
  end if;
  -- Đơn từ báo giá: khóa báo giá để hai lần đồng ý cùng lúc không sinh hai đơn.
  if nullif(p ->> 'quote_id', '') is not null then
    select * into v_quote from public.quotes
    where id = (p ->> 'quote_id')::uuid and lead_id = v_lead.id and status in ('sent', 'viewed') and order_id is null
      and valid_until > now()
    for update;
    if not found then
      raise exception 'quote_closed' using errcode = 'P0001';
    end if;
  end if;
  v_reason := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p -> 'approvals', '[]')) x);
  v_status := case when v_reason is not null and not v_owner then 'pending_approval' else 'confirmed' end;

  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  insert into public.order_counters (showroom_id, period, last_no) values (v_showroom, v_period, 1)
  on conflict (showroom_id, period) do update set last_no = public.order_counters.last_no + 1
  returning last_no into v_no;
  select code || '-' || v_period || '-' || lpad(v_no::text, 4, '0') into v_code from public.showrooms where id = v_showroom;

  insert into public.orders (
    showroom_id, code, lead_id, quote_id, buyer_contact_id, recipient_contact_id,
    ship_receiver, ship_street, ship_ward, ship_district, ship_province,
    is_gift, gift_message, keep_surprise, channel, seller_id, warehouse_id,
    subtotal, discount, delivery_fee, installation_fee, total, deposit_min, note, status, created_by
  ) values (
    v_showroom, v_code, v_lead.id, nullif(p ->> 'quote_id', '')::uuid, v_lead.contact_id, v_lead.recipient_contact_id,
    v_addr.receiver, v_addr.street, v_addr.ward, v_addr.district, v_addr.province,
    v_lead.recipient_contact_id is distinct from v_lead.contact_id,
    nullif(btrim(coalesce(p ->> 'gift_message', '')), ''), v_lead.keep_surprise,
    nullif(btrim(coalesce(p ->> 'channel', '')), ''), p_actor,
    (select id from public.warehouses where showroom_id = v_showroom and is_default),
    (p ->> 'subtotal')::bigint, (p ->> 'discount')::bigint, (p ->> 'delivery_fee')::bigint,
    (p ->> 'installation_fee')::bigint, (p ->> 'total')::bigint, (p ->> 'deposit_min')::bigint,
    nullif(btrim(coalesce(p ->> 'note', '')), ''), v_status, p_actor
  ) returning id into v_order;

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.order_items (showroom_id, order_id, variant_id, combo_id, sku, name, qty, unit_price, discount,
                                    line_total, is_gift)
    select v_showroom, v_order, v.id, nullif(l ->> 'combo_id', '')::uuid, v.sku, l ->> 'name', (l ->> 'qty')::int,
           (l ->> 'unit_price')::bigint, (l ->> 'discount')::bigint, (l ->> 'total')::bigint,
           coalesce((l ->> 'is_gift')::boolean, false)
    from public.product_variants v where v.id = (l ->> 'variant_id')::uuid and v.showroom_id = v_showroom;
    if not found then
      raise exception 'invalid pricing' using errcode = '22023';
    end if;
  end loop;
  for a in select * from jsonb_array_elements(coalesce(p -> 'applied', '[]')) loop
    insert into public.order_policy_applications (showroom_id, order_id, policy_id, policy_version, type, name, benefit)
    select v_showroom, v_order, pol.id, pol.version, pol.type, pol.name, a ->> 'benefit'
    from public.policies pol where pol.id = (a ->> 'id')::uuid and pol.showroom_id = v_showroom;
  end loop;
  insert into public.deliveries (order_id, showroom_id) values (v_order, v_showroom);

  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id, payload)
  select v_showroom, 'order_status_changed', c.id, c.household_id, v_lead.id, v_order, 'user', p_actor,
         jsonb_build_object('code', v_code, 'to', v_status, 'total', (p ->> 'total')::bigint)
  from public.contacts c where c.id = v_lead.contact_id;
  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (v_showroom, 'user', p_actor, 'order.create', 'orders', v_order::text,
          jsonb_build_object('code', v_code, 'total', (p ->> 'total')::bigint, 'status', v_status,
                             'approvals', v_reason, 'self_approved', v_reason is not null and v_owner));

  if v_quote.id is not null then
    update public.quotes set status = 'accepted', accepted_at = now(), order_id = v_order where id = v_quote.id;
    insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id,
                               payload)
    select v_showroom, 'quote_accepted', c.id, c.household_id, v_lead.id, v_order,
           case when v_by_customer then 'customer' else 'user' end, case when v_by_customer then null else p_actor end,
           jsonb_build_object('code', v_quote.code, 'quote_id', v_quote.id)
    from public.contacts c where c.id = v_lead.contact_id;
    if v_by_customer then
      insert into public.notifications (showroom_id, user_id, type, title, link)
      values (v_showroom, p_actor, 'quote_accepted', format('Khách đã đồng ý báo giá %s, đơn %s', v_quote.code, v_code),
              '/orders/' || v_order);
    end if;
  end if;

  if v_status = 'pending_approval' then
    insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
    values (v_showroom, 'discount', 'orders', v_order, p_actor, format('Đơn %s: %s', v_code, v_reason),
            jsonb_build_object('code', v_code, 'order_id', v_order, 'discount', (p ->> 'discount')::bigint));
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select pr.showroom_id, pr.id, 'discount_approval', format('Đơn %s chờ duyệt giảm giá', v_code), '/tasks'
    from public.profiles pr
    where pr.showroom_id = v_showroom and pr.is_active and pr.id <> p_actor
      and public.has_perm_for(pr.id, 'order.discount_approve');
  end if;
  return v_order;
end;
$$;

revoke all on function public.persist_priced_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_priced_order(uuid, jsonb) to service_role;

-- Báo giá: cùng dữ liệu đầu vào như đơn, thêm input (để định giá lại khi khách đồng ý) và kết quả định giá đầy đủ.
-- Gửi báo giá đầu tiên của lead thì lead sang Đã báo giá (CLAUDE.md mục 6).
create or replace function public.persist_quote(p_actor uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_showroom uuid;
  v_period text;
  v_no int;
  v_code text;
  v_id uuid;
  v_days int;
  v_old text;
  l jsonb;
begin
  v_lead := public.assert_actor_lead(p_actor, (p ->> 'lead_id')::uuid, 'quote.create',
                                     nullif(p ->> 'address_id', '')::uuid);
  v_showroom := v_lead.showroom_id;
  perform public.check_priced(p);
  select quote_valid_days into v_days from public.sales_settings where showroom_id = v_showroom;
  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  insert into public.quote_counters (showroom_id, period, last_no) values (v_showroom, v_period, 1)
  on conflict (showroom_id, period) do update set last_no = public.quote_counters.last_no + 1
  returning last_no into v_no;
  select 'BG-' || code || '-' || v_period || '-' || lpad(v_no::text, 4, '0') into v_code
  from public.showrooms where id = v_showroom;

  insert into public.quotes (showroom_id, code, lead_id, buyer_contact_id, recipient_contact_id, address_id,
                             ship_province, seller_id, status, valid_until, input, pricing, subtotal, discount, fees,
                             total, deposit_min, gift_message, note, sent_at, created_by)
  values (v_showroom, v_code, v_lead.id, v_lead.contact_id, v_lead.recipient_contact_id,
          nullif(p ->> 'address_id', '')::uuid, v_lead.recipient_province, p_actor, 'sent',
          now() + make_interval(days => coalesce(v_days, 7)), coalesce(p -> 'input', '{}'::jsonb),
          coalesce(p -> 'pricing', '{}'::jsonb), (p ->> 'subtotal')::bigint, (p ->> 'discount')::bigint,
          (p ->> 'delivery_fee')::bigint + (p ->> 'installation_fee')::bigint, (p ->> 'total')::bigint,
          (p ->> 'deposit_min')::bigint, nullif(btrim(coalesce(p ->> 'gift_message', '')), ''),
          nullif(btrim(coalesce(p ->> 'note', '')), ''), now(), p_actor)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.quote_items (showroom_id, quote_id, variant_id, combo_id, name, qty, unit_price, discount,
                                    line_total, is_gift)
    select v_showroom, v_id, v.id, nullif(l ->> 'combo_id', '')::uuid, l ->> 'name', (l ->> 'qty')::int,
           (l ->> 'unit_price')::bigint, (l ->> 'discount')::bigint, (l ->> 'total')::bigint,
           coalesce((l ->> 'is_gift')::boolean, false)
    from public.product_variants v where v.id = (l ->> 'variant_id')::uuid and v.showroom_id = v_showroom;
    if not found then
      raise exception 'invalid pricing' using errcode = '22023';
    end if;
  end loop;

  -- Giai đoạn lead: báo giá đầu tiên đưa lead lên Đã báo giá (không lùi).
  select stage into v_old from public.leads where id = v_lead.id;
  if v_old in ('new', 'contacted', 'demo') then
    perform set_config('app.stage_source', 'sales', true);
    update public.leads set stage = 'quoted' where id = v_lead.id;
    perform set_config('app.stage_source', '', true);
  end if;
  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, actor_type, actor_id, payload)
  select v_showroom, 'quote_sent', c.id, c.household_id, v_lead.id, 'user', p_actor,
         jsonb_build_object('code', v_code, 'total', (p ->> 'total')::bigint, 'quote_id', v_id)
  from public.contacts c where c.id = v_lead.contact_id;
  insert into public.audit_logs (showroom_id, actor_type, actor_id, action, entity, entity_id, metadata)
  values (v_showroom, 'user', p_actor, 'quote.create', 'quotes', v_id::text,
          jsonb_build_object('code', v_code, 'total', (p ->> 'total')::bigint));
  return v_id;
end;
$$;

revoke all on function public.persist_quote(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_quote(uuid, jsonb) to service_role;

-- Khách mở link báo giá (trang công khai, service_role): ghi lượt xem đầu tiên.
create or replace function public.mark_quote_viewed(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.quotes;
begin
  update public.quotes set status = 'viewed', viewed_at = now()
  where token = p_token and status = 'sent' and valid_until > now()
  returning * into v_q;
  if found then
    insert into public.events (showroom_id, type, contact_id, household_id, lead_id, actor_type, payload)
    select v_q.showroom_id, 'quote_viewed', c.id, c.household_id, v_q.lead_id, 'customer',
           jsonb_build_object('code', v_q.code, 'quote_id', v_q.id)
    from public.contacts c where c.id = v_q.buyer_contact_id;
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select v_q.showroom_id, v_q.seller_id, 'quote_viewed', format('Khách đã mở báo giá %s', v_q.code),
           '/leads/' || v_q.lead_id
    where v_q.seller_id is not null;
  end if;
end;
$$;

revoke all on function public.mark_quote_viewed(text) from public, anon, authenticated;
grant execute on function public.mark_quote_viewed(text) to service_role;

-- Báo giá quá hạn: job hằng ngày chuyển sang hết hạn.
create or replace function public.expire_quotes()
returns int
language sql
security definer
set search_path = ''
as $$
  with x as (
    update public.quotes set status = 'expired'
    where status in ('sent', 'viewed') and valid_until < now()
    returning 1
  )
  select count(*)::int from x;
$$;

revoke all on function public.expire_quotes() from public, anon, authenticated;

select cron.schedule('expire-quotes', '20 17 * * *', 'select public.expire_quotes()');
