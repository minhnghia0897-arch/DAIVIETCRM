-- Lát 2 "lên đơn kiểu Pancake" (11/10/2026, anh duyệt): sản phẩm, SKU, bảng giá và đơn hàng thật, tạo ngay trong
-- Hội thoại. Theo CLAUDE.md mục 8 nhưng chỉ phần cần để chốt đơn: chưa có tồn kho, giữ hàng, thanh toán, bảo hành,
-- báo giá gửi khách (làm ở các lát sau, tên bảng giữ đúng mục 8 để nối tiếp).
--
-- Tiền chỉ tính ở database: hàm create_order tự đọc giá trong bảng giá, phân bổ giảm giá, cộng phí; trình duyệt chỉ
-- gửi SKU, số lượng, giảm tay và phí giao lắp nhân viên nhập. Đơn chụp lại tên, giá lúc chốt.
--
-- Giá vốn chưa lưu (anh chỉ đưa giá bán lẻ); khi có sẽ để ở bảng riêng chỉ người có product.view_cost đọc được.

-- ---------------------------------------------------------------------------
-- Sản phẩm, SKU, bảng giá
-- ---------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  parent_id uuid references public.product_categories (id),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  category_id uuid references public.product_categories (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  brand text,
  description text,
  warranty_months int check (warranty_months is null or warranty_months >= 0),
  requires_installation boolean not null default false,
  installation_crew_size int,
  delivery_class text not null default 'parcel' check (delivery_class in ('parcel', 'bulky')),
  track_serial boolean not null default false,
  is_sellable boolean not null default true,
  is_gift_only boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  product_id uuid not null references public.products (id),
  sku text not null check (length(btrim(sku)) between 1 and 60),
  name text,
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, sku)
);

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  name text not null,
  channel text,
  valid_from timestamptz,
  valid_to timestamptz,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create unique index price_lists_default_idx on public.price_lists (showroom_id) where is_default;

-- Lịch sử giá giữ nguyên: đổi giá là thêm dòng mới với valid_from mới, không ghi đè.
create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  price_list_id uuid not null references public.price_lists (id),
  variant_id uuid not null references public.product_variants (id),
  price bigint not null check (price >= 0),
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

create index price_list_items_lookup_idx on public.price_list_items (price_list_id, variant_id, valid_from desc);

do $$
declare
  t text;
begin
  foreach t in array array['product_categories', 'products', 'product_variants', 'price_lists'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end;
$$;

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;

create policy product_categories_select on public.product_categories for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));
create policy products_select on public.products for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null and public.has_perm('product.view'));
create policy product_variants_select on public.product_variants for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));
create policy price_lists_select on public.price_lists for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));
create policy price_list_items_select on public.price_list_items for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));

-- Sửa sản phẩm, giá làm ở lát sau (màn Sản phẩm, nhập CSV); giờ chỉ đọc.
revoke insert, update, delete on public.product_categories, public.products, public.product_variants,
  public.price_lists, public.price_list_items from authenticated, anon;

-- Giá hiện hành của một SKU trong bảng giá mặc định (dòng mới nhất đã có hiệu lực).
create or replace function public.current_price(p_variant_id uuid, p_at timestamptz default now())
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select i.price
  from public.price_list_items i
  join public.price_lists pl on pl.id = i.price_list_id and pl.is_default
  where i.variant_id = p_variant_id and i.valid_from <= p_at
  order by i.valid_from desc
  limit 1;
$$;

revoke all on function public.current_price(uuid, timestamptz) from public, anon;
grant execute on function public.current_price(uuid, timestamptz) to authenticated;

-- Giới hạn giảm tay theo vai trò (CLAUDE.md 8.5, discount_limit): vượt mức thì đơn vào hàng chờ duyệt. Vai trò không
-- có dòng (Owner) không bị giới hạn. Bảng cấu hình; màn sửa ở Cài đặt, Bán hàng làm sau.
create table public.discount_limits (
  showroom_id uuid not null references public.showrooms (id),
  role_id uuid not null references public.roles (id) on delete cascade,
  max_pct numeric(5, 2) not null check (max_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (showroom_id, role_id)
);

alter table public.discount_limits enable row level security;
create policy discount_limits_select on public.discount_limits for select to authenticated
  using (showroom_id = public.current_showroom_id());
revoke insert, update, delete on public.discount_limits from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Đơn hàng
-- ---------------------------------------------------------------------------

create table public.order_counters (
  showroom_id uuid not null references public.showrooms (id),
  period text not null,
  last_no int not null default 0,
  primary key (showroom_id, period)
);

alter table public.order_counters enable row level security;
revoke all on public.order_counters from authenticated, anon;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null,
  lead_id uuid references public.leads (id),
  quote_id uuid,
  buyer_contact_id uuid not null references public.contacts (id),
  recipient_contact_id uuid references public.contacts (id),
  -- Địa chỉ giao chụp lại lúc chốt (từ contact_addresses).
  ship_receiver text,
  ship_street text,
  ship_ward text,
  ship_district text,
  ship_province text not null,
  is_gift boolean not null default false,
  gift_message text,
  keep_surprise boolean not null default false,
  channel text,
  seller_id uuid references public.profiles (id),
  subtotal bigint not null check (subtotal >= 0),
  discount bigint not null default 0 check (discount >= 0),
  delivery_fee bigint not null default 0 check (delivery_fee >= 0),
  installation_fee bigint not null default 0 check (installation_fee >= 0),
  total bigint not null check (total >= 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  balance_due bigint generated always as (total - paid_amount) stored,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'confirmed', 'deposit_paid', 'ready_to_ship', 'delivering', 'installed',
    'completed', 'cancelled', 'return_requested', 'returned')),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  unique (showroom_id, code),
  check (discount <= subtotal)
);

create index orders_buyer_idx on public.orders (buyer_contact_id);
create index orders_recipient_idx on public.orders (recipient_contact_id);
create index orders_lead_idx on public.orders (lead_id);
create index orders_seller_idx on public.orders (showroom_id, seller_id, created_at desc);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  combo_id uuid,
  sku text not null,
  name text not null,
  qty int not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  discount bigint not null default 0 check (discount >= 0),
  line_total bigint not null check (line_total >= 0),
  is_gift boolean not null default false,
  serial_unit_id uuid,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

-- Người xem được đơn: order.view_all, hoặc order.view_own với đơn mình bán.
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.deleted_at is null and o.showroom_id = public.current_showroom_id()
      and (public.has_perm('order.view_all')
           or (public.has_perm('order.view_own') and o.seller_id = public.effective_uid()))
  );
$$;

revoke all on function public.can_view_order(uuid) from public, anon;
grant execute on function public.can_view_order(uuid) to authenticated;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy orders_select on public.orders for select to authenticated
  using (
    showroom_id = public.current_showroom_id() and deleted_at is null
    and (public.has_perm('order.view_all')
         or (public.has_perm('order.view_own') and seller_id = public.effective_uid()))
  );
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

revoke insert, update, delete on public.orders, public.order_items from authenticated, anon;

-- Phần trăm gọn cho câu chữ: 7.00 → "7", 1.50 → "1,5".
create or replace function public.pct_text(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(rtrim(rtrim(round(p, 2)::text, '0'), '.'), '.', ',');
$$;

-- ---------------------------------------------------------------------------
-- Tạo đơn
-- ---------------------------------------------------------------------------

-- p_lines: [{"variant_id": uuid, "qty": int}], p_discount: {"type": "amount"|"pct", "value": number}.
-- Trả về id đơn. Đơn giảm vượt giới hạn của vai trò thì ở trạng thái chờ duyệt và sinh dòng approvals.
create or replace function public.create_order(
  p_lead_id uuid,
  p_lines jsonb,
  p_address_id uuid,
  p_discount jsonb default null,
  p_delivery_fee bigint default 0,
  p_installation_fee bigint default 0,
  p_note text default null,
  p_channel text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads;
  v_addr public.contact_addresses;
  v_showroom uuid;
  v_code text;
  v_period text;
  v_no int;
  v_order uuid;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_total bigint;
  v_pct numeric;
  v_limit numeric;
  v_owner boolean;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_rest bigint;
  v_share bigint;
  v_i int := 0;
  v_n int;
  v_status text;
  r record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('order.create') then
    raise exception 'not allowed to create orders' using errcode = '42501';
  end if;
  if not public.can_view_lead(p_lead_id) then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  v_showroom := v_lead.showroom_id;
  -- Bốn thông tin bắt buộc (CLAUDE.md mục 6): chưa đủ thì không chốt đơn.
  if v_lead.recipient_contact_id is null or v_lead.recipient_province is null
     or v_lead.occasion_id is null or v_lead.budget_range_id is null then
    raise exception 'missing_required_info' using errcode = 'P0001';
  end if;
  if v_lead.stage = 'lost' then
    raise exception 'lead_lost' using errcode = 'P0001';
  end if;

  select * into v_addr from public.contact_addresses
  where id = p_address_id and deleted_at is null
    and contact_id in (v_lead.contact_id, v_lead.recipient_contact_id);
  if not found then
    raise exception 'address_required' using errcode = 'P0001';
  end if;

  if coalesce(p_delivery_fee, 0) < 0 or coalesce(p_installation_fee, 0) < 0
     or coalesce(p_delivery_fee, 0) > 100000000 or coalesce(p_installation_fee, 0) > 100000000 then
    raise exception 'invalid fee' using errcode = '22023';
  end if;

  -- Dòng hàng: giá đọc từ bảng giá, không nhận giá từ trình duyệt.
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 50 then
    raise exception 'no lines' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select v.id, v.sku, coalesce(p.name || coalesce(' ' || v.name, ''), v.sku) as name,
           public.current_price(v.id) as price, (v_line ->> 'qty')::int as qty
      into r
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_line ->> 'variant_id')::uuid and v.showroom_id = v_showroom and v.is_active
      and p.deleted_at is null and p.status = 'active' and p.is_sellable;
    if not found or r.price is null then
      raise exception 'variant not sellable' using errcode = '22023';
    end if;
    if r.qty is null or r.qty < 1 or r.qty > 99 then
      raise exception 'invalid qty' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + r.price * r.qty;
    v_lines := v_lines || jsonb_build_object('variant_id', r.id, 'sku', r.sku, 'name', r.name,
                                             'unit_price', r.price, 'qty', r.qty, 'gross', r.price * r.qty);
  end loop;

  -- Giảm tay của người bán, áp sau cùng; làm tròn xuống tới đồng.
  if p_discount is not null and coalesce((p_discount ->> 'value')::numeric, 0) > 0 then
    if p_discount ->> 'type' = 'pct' then
      if (p_discount ->> 'value')::numeric > 100 then
        raise exception 'invalid discount' using errcode = '22023';
      end if;
      v_discount := floor(v_subtotal * (p_discount ->> 'value')::numeric / 100);
    elsif p_discount ->> 'type' = 'amount' then
      v_discount := floor((p_discount ->> 'value')::numeric);
    else
      raise exception 'invalid discount' using errcode = '22023';
    end if;
  end if;
  if v_discount > v_subtotal then
    raise exception 'invalid discount' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount + coalesce(p_delivery_fee, 0) + coalesce(p_installation_fee, 0);

  -- Giới hạn giảm theo vai trò người bán; Owner không giới hạn.
  select coalesce(ro.is_owner, false), dl.max_pct into v_owner, v_limit
  from public.profiles pr
  left join public.roles ro on ro.id = pr.role_id
  left join public.discount_limits dl on dl.role_id = pr.role_id and dl.showroom_id = v_showroom
  where pr.id = v_user;
  v_pct := case when v_subtotal = 0 then 0 else round(v_discount * 100.0 / v_subtotal, 2) end;
  v_status := case when v_limit is not null and v_pct > v_limit and not coalesce(v_owner, false)
                   then 'pending_approval' else 'confirmed' end;

  -- Mã đơn: mã showroom, năm tháng giờ VN, số thứ tự trong tháng.
  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  insert into public.order_counters (showroom_id, period, last_no) values (v_showroom, v_period, 1)
  on conflict (showroom_id, period) do update set last_no = public.order_counters.last_no + 1
  returning last_no into v_no;
  select code || '-' || v_period || '-' || lpad(v_no::text, 4, '0') into v_code
  from public.showrooms where id = v_showroom;

  insert into public.orders (
    showroom_id, code, lead_id, buyer_contact_id, recipient_contact_id,
    ship_receiver, ship_street, ship_ward, ship_district, ship_province,
    is_gift, keep_surprise, channel, seller_id,
    subtotal, discount, delivery_fee, installation_fee, total, note, status, created_by
  ) values (
    v_showroom, v_code, v_lead.id, v_lead.contact_id, v_lead.recipient_contact_id,
    v_addr.receiver, v_addr.street, v_addr.ward, v_addr.district, v_addr.province,
    v_lead.recipient_contact_id is distinct from v_lead.contact_id, v_lead.keep_surprise,
    nullif(btrim(coalesce(p_channel, '')), ''), v_user,
    v_subtotal, v_discount, coalesce(p_delivery_fee, 0), coalesce(p_installation_fee, 0), v_total,
    nullif(btrim(coalesce(p_note, '')), ''), v_status, v_user
  ) returning id into v_order;

  -- Phân bổ giảm giá về từng dòng theo tỷ lệ giá trị dòng; phần lẻ dồn vào dòng cuối để tổng khớp đúng.
  v_rest := v_discount;
  v_n := jsonb_array_length(v_lines);
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_i := v_i + 1;
    v_share := case when v_i = v_n then v_rest
                    when v_subtotal = 0 then 0
                    else floor(v_discount * (v_line ->> 'gross')::numeric / v_subtotal) end;
    v_rest := v_rest - v_share;
    insert into public.order_items (showroom_id, order_id, variant_id, sku, name, qty, unit_price, discount, line_total)
    values (v_showroom, v_order, (v_line ->> 'variant_id')::uuid, v_line ->> 'sku', v_line ->> 'name',
            (v_line ->> 'qty')::int, (v_line ->> 'unit_price')::bigint, v_share,
            (v_line ->> 'gross')::bigint - v_share);
  end loop;

  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id, payload)
  select v_showroom, 'order_status_changed', c.id, c.household_id, v_lead.id, v_order, 'user', v_user,
         jsonb_build_object('code', v_code, 'to', v_status, 'total', v_total)
  from public.contacts c where c.id = v_lead.contact_id;

  perform public.write_audit('order.create', 'orders', v_order::text,
    jsonb_build_object('code', v_code, 'total', v_total, 'discount_pct', v_pct, 'status', v_status));

  if v_status = 'pending_approval' then
    insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
    values (v_showroom, 'discount', 'orders', v_order, v_user,
            format('Giảm %s%% trên đơn %s, vượt giới hạn %s%%', public.pct_text(v_pct), v_code, public.pct_text(v_limit)),
            jsonb_build_object('code', v_code, 'pct', v_pct, 'limit', v_limit, 'discount', v_discount,
                               'subtotal', v_subtotal));
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select p.showroom_id, p.id, 'discount_approval', format('Đơn %s chờ duyệt giảm giá %s%%', v_code, public.pct_text(v_pct)),
           '/tasks'
    from public.profiles p
    where p.showroom_id = v_showroom and p.is_active and p.id <> v_user
      and public.has_perm_for(p.id, 'order.discount_approve');
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_order(uuid, jsonb, uuid, jsonb, bigint, bigint, text, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, uuid, jsonb, bigint, bigint, text, text) to authenticated;

-- Quyết định duyệt giảm giá đi qua hàng chờ duyệt dùng chung (màn Việc của tôi): guard_approval_decision kiểm quyền
-- order.discount_approve, chặn tự duyệt (trừ Owner), ghi nhật ký. Trigger dưới áp quyết định vào đơn: duyệt thì đơn
-- sang confirmed; từ chối thì hủy đơn để người bán lên lại đơn với mức giảm được phép.
create or replace function public.apply_discount_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'discount' or new.entity <> 'orders' or new.status = old.status or old.status <> 'pending'
     or new.status not in ('approved', 'rejected') then
    return null;
  end if;
  update public.orders
    set status = case when new.status = 'approved' then 'confirmed' else 'cancelled' end,
        cancel_reason = case when new.status = 'approved' then null else 'Giảm giá không được duyệt' end
  where id = new.entity_id and status = 'pending_approval';
  if found then
    insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id,
                               payload)
    select o.showroom_id, 'order_status_changed', o.buyer_contact_id, c.household_id, o.lead_id, o.id, 'user',
           auth.uid(),
           jsonb_build_object('code', o.code, 'to', o.status, 'reason', 'discount_' || new.status)
    from public.orders o join public.contacts c on c.id = o.buyer_contact_id
    where o.id = new.entity_id;
  end if;
  if new.requested_by is not null and new.requested_by is distinct from auth.uid() then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    values (new.showroom_id, new.requested_by, 'approval_decided',
            format('Đơn %s %s', new.payload ->> 'code',
                   case when new.status = 'approved' then 'đã được duyệt giảm giá'
                        else 'không được duyệt giảm giá, đơn đã hủy' end),
            '/inbox');
  end if;
  return null;
end;
$$;

revoke all on function public.apply_discount_decision() from public, anon, authenticated;

create trigger approvals_discount after update on public.approvals
  for each row execute function public.apply_discount_decision();

-- ---------------------------------------------------------------------------
-- Dữ liệu khởi tạo: 5 ghế massage Daikiosan, giá dự kiến bán lẻ (anh gửi 11/10/2026); giới hạn giảm 5% cho Sale
-- admin và Telesale (CLAUDE.md 8.5).
-- ---------------------------------------------------------------------------

insert into public.product_categories (showroom_id, name, sort)
select s.id, c.name, c.sort
from public.showrooms s
cross join (values ('Ghế massage', 1), ('Máy lọc nước', 2), ('Lõi lọc và vật tư', 3), ('Quà tặng kèm', 4),
                   ('Phụ kiện', 5)) as c(name, sort)
where s.code = 'Q4'
on conflict do nothing;

insert into public.price_lists (showroom_id, name, is_default)
select s.id, 'Giá bán lẻ', true from public.showrooms s where s.code = 'Q4';

with chairs (model, price) as (
  values ('DC108', 16050000::bigint), ('DC117', 18890000), ('DC112', 26940000), ('DC203', 34580000),
         ('DC302', 49000000)
), prod as (
  insert into public.products (showroom_id, category_id, name, brand, requires_installation, installation_crew_size,
                               delivery_class, track_serial)
  select s.id, pc.id, 'Ghế massage Daikiosan ' || ch.model, 'Daikiosan', true, 2, 'bulky', true
  from chairs ch
  join public.showrooms s on s.code = 'Q4'
  join public.product_categories pc on pc.showroom_id = s.id and pc.name = 'Ghế massage'
  returning id, showroom_id, name
), variant as (
  insert into public.product_variants (showroom_id, product_id, sku)
  select p.showroom_id, p.id, replace(p.name, 'Ghế massage Daikiosan ', '')
  from prod p
  returning id, showroom_id, sku
)
insert into public.price_list_items (showroom_id, price_list_id, variant_id, price, valid_from)
select v.showroom_id, pl.id, v.id, ch.price, '2026-10-01T00:00:00+07:00'
from variant v
join chairs ch on ch.model = v.sku
join public.price_lists pl on pl.showroom_id = v.showroom_id and pl.is_default;

insert into public.discount_limits (showroom_id, role_id, max_pct)
select r.showroom_id, r.id, 5
from public.roles r
join public.showrooms s on s.id = r.showroom_id and s.code = 'Q4'
where r.key in ('sale_admin', 'telesale')
on conflict do nothing;
