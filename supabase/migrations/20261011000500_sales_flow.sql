-- Luồng bán hàng đầy đủ như bản demo (11/10/2026, anh duyệt kế hoạch 5 đợt, đợt 1–4): cài đặt bán hàng, kho, sổ
-- kho bất biến, phiếu kho, giữ hàng, serial, thanh toán (ghi nhận và xác nhận tách người), chuyển trạng thái đơn,
-- giao lắp, bảo hành, luật sinh việc hậu bán, đồng bộ giai đoạn lead và vòng đời khách (CLAUDE.md mục 6, 8).
--
-- Mọi ghi đi qua hàm dưới đây: kiểm quyền, chặn "Xem như", ghi nhật ký kiểm toán và dòng sự kiện.

-- ---------------------------------------------------------------------------
-- Cài đặt bán hàng (Cài đặt, Bán hàng): mức cọc, số ngày giữ hàng, thông tin chuyển khoản hiển thị cho khách.
-- Mặc định theo ví dụ ở CLAUDE.md 8.5 (cọc tối thiểu 10 triệu hoặc 10%, giữ hàng 14 ngày); Owner sửa được.
-- ---------------------------------------------------------------------------

create table public.sales_settings (
  showroom_id uuid primary key references public.showrooms (id),
  deposit_min_amount bigint not null default 10000000 check (deposit_min_amount >= 0),
  deposit_min_pct numeric(5, 2) not null default 10 check (deposit_min_pct between 0 and 100),
  hold_days int not null default 14 check (hold_days between 1 and 90),
  quote_valid_days int not null default 7 check (quote_valid_days between 1 and 90),
  bank_info text check (bank_info is null or length(bank_info) <= 1000),
  post_delivery_call_days int not null default 3 check (post_delivery_call_days between 0 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.sales_settings enable row level security;
create policy sales_settings_select on public.sales_settings for select to authenticated
  using (showroom_id = public.current_showroom_id());
revoke insert, update, delete on public.sales_settings from authenticated, anon;

insert into public.sales_settings (showroom_id) select id from public.showrooms on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Kho
-- ---------------------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null check (length(btrim(code)) between 1 and 20),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Kho Đại Việt: kho ảo, admin cập nhật tay theo số Đại Việt báo. Hàng trưng bày: không bán từ kho này.
  is_virtual boolean not null default false,
  is_display boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, code)
);

create unique index warehouses_default_idx on public.warehouses (showroom_id) where is_default;

create trigger warehouses_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();

insert into public.warehouses (showroom_id, code, name, is_virtual, is_display, is_default, sort)
select s.id, w.code, w.name, w.v, w.d, w.def, w.sort
from public.showrooms s
cross join (values ('Q4', 'Kho showroom Q4', false, false, true, 1),
                   ('DV', 'Kho Đại Việt', true, false, false, 2),
                   ('TB', 'Hàng trưng bày', false, true, false, 3)) as w(code, name, v, d, def, sort)
where s.code = 'Q4'
on conflict do nothing;

create table public.stock_levels (
  showroom_id uuid not null references public.showrooms (id),
  variant_id uuid not null references public.product_variants (id),
  warehouse_id uuid not null references public.warehouses (id),
  on_hand int not null default 0 check (on_hand >= 0),
  reserved int not null default 0 check (reserved >= 0),
  low_threshold int check (low_threshold is null or low_threshold >= 0),
  available int generated always as (on_hand - reserved) stored,
  updated_at timestamptz not null default now(),
  primary key (variant_id, warehouse_id),
  check (reserved <= on_hand)
);

-- Sổ kho bất biến: mọi thay đổi tồn là một dòng ở đây; số tồn cập nhật bằng trigger trong cùng giao dịch.
create table public.stock_movements (
  id bigint generated always as identity primary key,
  showroom_id uuid not null references public.showrooms (id),
  type text not null check (type in ('receipt', 'sale_out', 'transfer_out', 'transfer_in', 'return_in',
                                     'adjust_plus', 'adjust_minus', 'demo_in', 'demo_out')),
  variant_id uuid not null references public.product_variants (id),
  warehouse_id uuid not null references public.warehouses (id),
  qty int not null check (qty > 0),
  document_id uuid,
  order_id uuid references public.orders (id),
  reason text,
  actor_id uuid,
  at timestamptz not null default now()
);

create index stock_movements_lookup_idx on public.stock_movements (showroom_id, at desc);
create index stock_movements_variant_idx on public.stock_movements (variant_id, warehouse_id, at desc);

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta int := case when new.type in ('receipt', 'transfer_in', 'return_in', 'adjust_plus', 'demo_in')
                      then new.qty else -new.qty end;
begin
  if v_delta < 0 then
    -- Không bán âm: thiếu hàng thì ràng buộc on_hand >= 0, reserved <= on_hand báo lỗi.
    update public.stock_levels set on_hand = on_hand + v_delta, updated_at = now()
    where variant_id = new.variant_id and warehouse_id = new.warehouse_id;
    if not found then
      raise exception 'insufficient_stock' using errcode = '23514';
    end if;
  else
    insert into public.stock_levels (showroom_id, variant_id, warehouse_id, on_hand)
    values (new.showroom_id, new.variant_id, new.warehouse_id, v_delta)
    on conflict (variant_id, warehouse_id) do update
      set on_hand = public.stock_levels.on_hand + v_delta, updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.apply_stock_movement() from public, anon, authenticated;

create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- Sổ kho không sửa, không xóa; sai thì lập phiếu điều chỉnh.
create or replace function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.forbid_change();

create table public.stock_documents (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null,
  kind text not null check (kind in ('receipt', 'issue', 'transfer', 'count')),
  warehouse_id uuid not null references public.warehouses (id),
  to_warehouse_id uuid references public.warehouses (id),
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'posted', 'cancelled')),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  unique (showroom_id, code),
  check (kind <> 'transfer' or (to_warehouse_id is not null and to_warehouse_id <> warehouse_id))
);

create trigger stock_documents_updated_at before update on public.stock_documents
  for each row execute function public.set_updated_at();

create table public.stock_document_lines (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  document_id uuid not null references public.stock_documents (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  qty int check (qty is null or qty > 0),
  -- Kiểm kê: số đếm thực tế và số trên sổ lúc gửi duyệt.
  counted int check (counted is null or counted >= 0),
  expected int,
  serials text[] not null default '{}'::text[]
);

create index stock_document_lines_doc_idx on public.stock_document_lines (document_id);

create table public.serial_units (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  serial text not null check (length(btrim(serial)) between 1 and 80),
  variant_id uuid not null references public.product_variants (id),
  warehouse_id uuid references public.warehouses (id),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'reserved', 'sold', 'demo', 'returned', 'defective')),
  order_item_id uuid references public.order_items (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (showroom_id, serial)
);

create trigger serial_units_updated_at before update on public.serial_units
  for each row execute function public.set_updated_at();

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  order_id uuid not null references public.orders (id),
  order_item_id uuid not null references public.order_items (id),
  variant_id uuid not null references public.product_variants (id),
  warehouse_id uuid not null references public.warehouses (id),
  qty int not null check (qty > 0),
  expires_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now()
);

create index stock_reservations_open_idx on public.stock_reservations (order_id) where released_at is null;

-- Vật tư thay định kỳ (máy lọc nước → lõi lọc): hoàn tất đơn thì sinh nhắc thay lõi.
create table public.consumable_links (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  product_id uuid not null references public.products (id),
  consumable_variant_id uuid not null references public.product_variants (id),
  replacement_cycle_months int not null check (replacement_cycle_months between 1 and 60),
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['warehouses', 'stock_levels', 'stock_movements', 'stock_documents', 'stock_document_lines',
                           'serial_units', 'stock_reservations', 'consumable_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end;
$$;

create policy warehouses_select on public.warehouses for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('inventory.view') or public.has_perm('product.view')));
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('inventory.view') or public.has_perm('product.view')));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('inventory.view'));
create policy stock_documents_select on public.stock_documents for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('inventory.view'));
create policy stock_document_lines_select on public.stock_document_lines for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('inventory.view'));
create policy serial_units_select on public.serial_units for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('inventory.view')
              or (order_item_id is not null and exists (
                    select 1 from public.order_items oi where oi.id = serial_units.order_item_id))));
create policy stock_reservations_select on public.stock_reservations for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('inventory.view') or public.can_view_order(order_id)));
create policy consumable_links_select on public.consumable_links for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('product.view'));

-- ---------------------------------------------------------------------------
-- Đơn: cột phục vụ giữ hàng, thu khi giao, đặt trước, xuất kho, giao lắp
-- ---------------------------------------------------------------------------

alter table public.orders
  add column warehouse_id uuid references public.warehouses (id),
  add column deposit_min bigint check (deposit_min is null or deposit_min >= 0),
  add column hold_until timestamptz,
  add column cod_approved_at timestamptz,
  add column cod_approved_by uuid,
  add column backorder_until date,
  add column stock_issued_at timestamptz,
  add column completed_at timestamptz;

create table public.deliveries (
  order_id uuid primary key references public.orders (id) on delete cascade,
  showroom_id uuid not null references public.showrooms (id),
  scheduled_on date,
  crew_note text check (crew_note is null or length(crew_note) <= 500),
  installed_at timestamptz,
  handover_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.deliveries enable row level security;
create policy deliveries_select on public.deliveries for select to authenticated
  using (public.can_view_order(order_id) or (showroom_id = public.current_showroom_id()
                                             and public.has_perm('delivery.update')));
revoke insert, update, delete on public.deliveries from authenticated, anon;

-- Người giao lắp (delivery.update) xem được đơn đang ở các bước giao.
create policy orders_select_delivery on public.orders for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null and public.has_perm('delivery.update')
         and status in ('ready_to_ship', 'delivering', 'installed', 'completed'));

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  code text not null,
  order_id uuid not null references public.orders (id),
  order_item_id uuid not null references public.order_items (id),
  serial_unit_id uuid references public.serial_units (id),
  serial text,
  product_name text not null,
  owner_contact_id uuid references public.contacts (id),
  starts_on date not null,
  -- Null khi sản phẩm chưa khai thời hạn bảo hành (sửa ở màn Sản phẩm rồi cập nhật phiếu).
  ends_on date,
  status text not null default 'active' check (status in ('active', 'expired', 'void')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, code)
);

create trigger warranties_updated_at before update on public.warranties
  for each row execute function public.set_updated_at();

alter table public.warranties enable row level security;
create policy warranties_select on public.warranties for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.has_perm('warranty.manage') or public.can_view_order(order_id)));
revoke insert, update, delete on public.warranties from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Thanh toán
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  order_id uuid not null references public.orders (id),
  type text not null check (type in ('deposit', 'balance', 'refund')),
  method text not null check (method in ('bank_transfer', 'cash', 'cod')),
  amount bigint not null check (amount > 0),
  reference text check (reference is null or length(reference) <= 200),
  -- Ảnh chứng từ trong Storage riêng tư (bucket payment-proofs), mở bằng link ký ngắn hạn.
  proof_path text,
  status text not null default 'recorded' check (status in ('recorded', 'confirmed', 'rejected')),
  recorded_by uuid references public.profiles (id),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (showroom_id = public.current_showroom_id()
         and (public.can_view_order(order_id) or public.has_perm('payment.confirm')));
revoke insert, update, delete on public.payments from authenticated, anon;

-- Người xác nhận tiền xem được đơn có khoản chờ xác nhận.
create policy orders_select_payment on public.orders for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null and public.has_perm('payment.confirm'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Luật sinh việc hậu bán (cấu hình được ở Cài đặt, Luật sinh việc)
-- ---------------------------------------------------------------------------

insert into public.task_rules (showroom_id, rule_key, name, trigger, task_type, title_template, due_offset, assignee,
                               priority)
select s.id, r.key, r.name, r.trig::jsonb, r.ttype, r.title, r.due::interval, r.assignee, r.prio
from public.showrooms s
cross join (values
  ('post_delivery_call', 'Gọi hỏi thăm sau giao', '{"event":"order_completed"}', 'post_delivery_call',
   'Gọi hỏi thăm sau giao đơn {code}', '3 days', 'order_seller', 2),
  ('referral_ask', 'Mời giới thiệu sau khi dùng', '{"event":"order_completed"}', 'other',
   'Mời khách đơn {code} giới thiệu người quen', '30 days', 'order_seller', 3),
  ('hold_expired', 'Hết hạn giữ hàng', '{"event":"hold_expired"}', 'delivery_step',
   'Đơn {code} hết hạn giữ hàng, đã nhả hàng: liên hệ khách thanh toán hoặc gia hạn', '1 hour', 'order_seller', 1),
  ('confirm_delivery', 'Xác nhận người nhận, lịch giao', '{"event":"order_deposit_paid"}', 'delivery_step',
   'Xác nhận người nhận và hẹn lịch giao đơn {code}', '1 day', 'order_seller', 2)
) as r(key, name, trig, ttype, title, due, assignee, prio)
where not exists (select 1 from public.task_rules t where t.showroom_id = s.id and t.rule_key = r.key);

create or replace function public.fire_order_rules(p_event text, p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_n int := 0;
  r record;
begin
  select * into v_o from public.orders where id = p_order_id;
  for r in select * from public.task_rules
           where showroom_id = v_o.showroom_id and is_active and trigger ->> 'event' = p_event loop
    insert into public.tasks (showroom_id, type, title, contact_id, lead_id, order_id, assigned_to, due_at, priority,
                              source, rule_key)
    values (v_o.showroom_id, r.task_type, replace(r.title_template, '{code}', v_o.code), v_o.buyer_contact_id,
            v_o.lead_id, v_o.id,
            case when r.assignee = 'shared_queue' then null
                 when r.assignee = 'lead_owner' then (select assigned_to from public.leads where id = v_o.lead_id)
                 else v_o.seller_id end,
            now() + r.due_offset, r.priority, 'rule', r.rule_key);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.fire_order_rules(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hàm dùng chung
-- ---------------------------------------------------------------------------

-- Tiền viết kiểu Việt: 10000000 → "10.000.000".
create or replace function public.money_text(p bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p, 'FM999G999G999G999'), ',', '.');
$$;

create or replace function public.assert_writer()
returns uuid
language plpgsql
stable
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
  return auth.uid();
end;
$$;

revoke all on function public.assert_writer() from public, anon, authenticated;

-- Người sửa được đơn: order.edit_all, hoặc order.edit_own với đơn mình bán.
create or replace function public.assert_order_editor(p_order_id uuid)
returns public.orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  perform public.assert_writer();
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not (public.has_perm('order.edit_all') or (public.has_perm('order.edit_own') and v_o.seller_id = auth.uid())) then
    raise exception 'not allowed to edit this order' using errcode = '42501';
  end if;
  return v_o;
end;
$$;

revoke all on function public.assert_order_editor(uuid) from public, anon, authenticated;

-- Tiền đã xác nhận (cọc và phần còn lại, trừ hoàn tiền) và tiền chờ xác nhận của đơn.
create or replace function public.order_paid(p_order_id uuid, out confirmed bigint, out pending bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(case when status = 'confirmed' and type <> 'refund' then amount
                      when status = 'confirmed' and type = 'refund' then -amount else 0 end), 0)::bigint,
    coalesce(sum(case when status = 'recorded' and type <> 'refund' then amount else 0 end), 0)::bigint
  from public.payments where order_id = p_order_id;
$$;

revoke all on function public.order_paid(uuid) from public, anon;
grant execute on function public.order_paid(uuid) to authenticated;

-- Cọc tối thiểu: max(mức tiền, % tổng), không quá tổng.
create or replace function public.order_deposit_min(p_order public.orders)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_order.deposit_min,
                  least(p_order.total, greatest(s.deposit_min_amount, floor(p_order.total * s.deposit_min_pct / 100)::bigint)))
  from public.sales_settings s where s.showroom_id = p_order.showroom_id;
$$;

revoke all on function public.order_deposit_min(public.orders) from public, anon;
grant execute on function public.order_deposit_min(public.orders) to authenticated;

-- Giai đoạn lead đi tới từ đơn (không lùi): deposit, won. Đặt cờ app.stage_source để trigger lead cho phép.
create or replace function public.sync_lead_from_order(p_order_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_rank jsonb := '{"new":0,"contacted":1,"demo":2,"quoted":3,"deposit":4,"won":5,"lost":-1}';
  v_old text;
begin
  select * into v_o from public.orders where id = p_order_id;
  if v_o.lead_id is null then
    return;
  end if;
  select stage into v_old from public.leads where id = v_o.lead_id;
  if v_old = 'lost' or (v_rank ->> v_old)::int >= (v_rank ->> p_stage)::int then
    return;
  end if;
  perform set_config('app.stage_source', 'sales', true);
  update public.leads set stage = p_stage where id = v_o.lead_id;
  perform set_config('app.stage_source', '', true);
  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id,
                             payload)
  select v_o.showroom_id, 'stage_change', c.id, c.household_id, v_o.lead_id, v_o.id,
         case when auth.uid() is null then 'system' else 'user' end, auth.uid(),
         jsonb_build_object('from', v_old, 'to', p_stage, 'by', 'order', 'code', v_o.code)
  from public.contacts c where c.id = v_o.buyer_contact_id;
end;
$$;

revoke all on function public.sync_lead_from_order(uuid, text) from public, anon, authenticated;

-- Vòng đời khách từ đơn (CLAUDE.md 1.1): đã cọc → Khách mới; hoàn tất → Đang sử dụng (khách thân giữ nguyên).
create or replace function public.sync_lifecycle_from_order(p_order_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_paid bigint;
  v_cnt int;
begin
  select * into v_o from public.orders where id = p_order_id;
  select coalesce(sum(paid_amount), 0), count(*) filter (where status = 'completed')
    into v_paid, v_cnt
  from public.orders where buyer_contact_id = v_o.buyer_contact_id and deleted_at is null;
  update public.contacts
    set lifecycle_stage = case
      when lifecycle_stage in ('do_not_contact', 'loyal') then lifecycle_stage
      when p_stage = 'active_owner' then 'active_owner'
      when lifecycle_stage in ('active_owner') then lifecycle_stage
      else p_stage end
  where id in (v_o.buyer_contact_id, v_o.recipient_contact_id);
  insert into public.customer_lifecycle (contact_id, showroom_id, stage, total_paid, orders_count, last_interaction_at)
  select c.id, c.showroom_id, c.lifecycle_stage, v_paid, v_cnt, now()
  from public.contacts c where c.id = v_o.buyer_contact_id
  on conflict (contact_id) do update
    set stage_since = case when public.customer_lifecycle.stage is distinct from excluded.stage then now()
                           else public.customer_lifecycle.stage_since end,
        stage = excluded.stage, total_paid = excluded.total_paid, orders_count = excluded.orders_count,
        last_interaction_at = now(), updated_at = now();
end;
$$;

revoke all on function public.sync_lifecycle_from_order(uuid, text) from public, anon, authenticated;

create or replace function public.order_event(p_order_id uuid, p_type text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (showroom_id, type, contact_id, household_id, lead_id, order_id, actor_type, actor_id,
                             payload)
  select o.showroom_id, p_type, o.buyer_contact_id, c.household_id, o.lead_id, o.id,
         case when auth.uid() is null then 'system' else 'user' end, auth.uid(),
         coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('code', o.code)
  from public.orders o join public.contacts c on c.id = o.buyer_contact_id where o.id = p_order_id;
$$;

revoke all on function public.order_event(uuid, text, jsonb) from public, anon, authenticated;

-- Nhả mọi giữ hàng còn mở của đơn.
create or replace function public.release_order_reservations(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select * from public.stock_reservations where order_id = p_order_id and released_at is null for update loop
    update public.stock_levels set reserved = greatest(reserved - r.qty, 0), updated_at = now()
    where variant_id = r.variant_id and warehouse_id = r.warehouse_id;
    update public.stock_reservations set released_at = now(), release_reason = p_reason where id = r.id;
  end loop;
end;
$$;

revoke all on function public.release_order_reservations(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tạo đơn (thay bản lát 2): thêm lời chúc, kho xuất, chụp mức cọc tối thiểu
-- ---------------------------------------------------------------------------

drop function public.create_order(uuid, jsonb, uuid, jsonb, bigint, bigint, text, text);

create or replace function public.create_order(
  p_lead_id uuid,
  p_lines jsonb,
  p_address_id uuid,
  p_discount jsonb default null,
  p_delivery_fee bigint default 0,
  p_installation_fee bigint default 0,
  p_note text default null,
  p_channel text default null,
  p_gift_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
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
  v_o public.orders;
  r record;
begin
  if not public.has_perm('order.create') then
    raise exception 'not allowed to create orders' using errcode = '42501';
  end if;
  if not public.can_view_lead(p_lead_id) then
    raise exception 'lead not found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  v_showroom := v_lead.showroom_id;
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
  if length(coalesce(p_gift_message, '')) > 500 then
    raise exception 'invalid gift message' using errcode = '22023';
  end if;
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

  select coalesce(ro.is_owner, false), dl.max_pct into v_owner, v_limit
  from public.profiles pr
  left join public.roles ro on ro.id = pr.role_id
  left join public.discount_limits dl on dl.role_id = pr.role_id and dl.showroom_id = v_showroom
  where pr.id = v_user;
  v_pct := case when v_subtotal = 0 then 0 else round(v_discount * 100.0 / v_subtotal, 2) end;
  v_status := case when v_limit is not null and v_pct > v_limit and not coalesce(v_owner, false)
                   then 'pending_approval' else 'confirmed' end;

  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  insert into public.order_counters (showroom_id, period, last_no) values (v_showroom, v_period, 1)
  on conflict (showroom_id, period) do update set last_no = public.order_counters.last_no + 1
  returning last_no into v_no;
  select code || '-' || v_period || '-' || lpad(v_no::text, 4, '0') into v_code
  from public.showrooms where id = v_showroom;

  insert into public.orders (
    showroom_id, code, lead_id, buyer_contact_id, recipient_contact_id,
    ship_receiver, ship_street, ship_ward, ship_district, ship_province,
    is_gift, gift_message, keep_surprise, channel, seller_id, warehouse_id,
    subtotal, discount, delivery_fee, installation_fee, total, note, status, created_by
  ) values (
    v_showroom, v_code, v_lead.id, v_lead.contact_id, v_lead.recipient_contact_id,
    v_addr.receiver, v_addr.street, v_addr.ward, v_addr.district, v_addr.province,
    v_lead.recipient_contact_id is distinct from v_lead.contact_id,
    nullif(btrim(coalesce(p_gift_message, '')), ''), v_lead.keep_surprise,
    nullif(btrim(coalesce(p_channel, '')), ''), v_user,
    (select id from public.warehouses where showroom_id = v_showroom and is_default),
    v_subtotal, v_discount, coalesce(p_delivery_fee, 0), coalesce(p_installation_fee, 0), v_total,
    nullif(btrim(coalesce(p_note, '')), ''), v_status, v_user
  ) returning * into v_o;
  v_order := v_o.id;
  update public.orders set deposit_min = public.order_deposit_min(v_o) where id = v_order;

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
  insert into public.deliveries (order_id, showroom_id) values (v_order, v_showroom);

  perform public.order_event(v_order, 'order_status_changed', jsonb_build_object('to', v_status, 'total', v_total));
  perform public.write_audit('order.create', 'orders', v_order::text,
    jsonb_build_object('code', v_code, 'total', v_total, 'discount_pct', v_pct, 'status', v_status));

  if v_status = 'pending_approval' then
    insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
    values (v_showroom, 'discount', 'orders', v_order, v_user,
            format('Giảm %s%% trên đơn %s, vượt giới hạn %s%%', public.pct_text(v_pct), v_code,
                   public.pct_text(v_limit)),
            jsonb_build_object('code', v_code, 'pct', v_pct, 'limit', v_limit, 'discount', v_discount,
                               'subtotal', v_subtotal, 'order_id', v_order));
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select p.showroom_id, p.id, 'discount_approval',
           format('Đơn %s chờ duyệt giảm giá %s%%', v_code, public.pct_text(v_pct)), '/tasks'
    from public.profiles p
    where p.showroom_id = v_showroom and p.is_active and p.id <> v_user
      and public.has_perm_for(p.id, 'order.discount_approve');
  end if;
  return v_order;
end;
$$;

revoke all on function public.create_order(uuid, jsonb, uuid, jsonb, bigint, bigint, text, text, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, uuid, jsonb, bigint, bigint, text, text, text) to authenticated;

-- Đơn tạo trước migration này chưa có kho, mức cọc, dòng giao lắp.
update public.orders o
  set warehouse_id = (select id from public.warehouses w where w.showroom_id = o.showroom_id and w.is_default)
  where warehouse_id is null;
update public.orders o set deposit_min = public.order_deposit_min(o) where deposit_min is null;
insert into public.deliveries (order_id, showroom_id) select id, showroom_id from public.orders on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Chuyển trạng thái đơn
-- ---------------------------------------------------------------------------

-- Lý do chặn bước chuyển kế tiếp (rỗng là chuyển được); giao diện hiện đúng danh sách này.
create or replace function public.order_blockers(p_order_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_paid record;
  v_out text[] := '{}';
  r record;
begin
  if not public.can_view_order(p_order_id) and not exists (
    select 1 from public.orders where id = p_order_id and showroom_id = public.current_showroom_id()
      and (public.has_perm('delivery.update') or public.has_perm('payment.confirm'))) then
    return v_out;
  end if;
  select * into v_o from public.orders where id = p_order_id;
  select * into v_paid from public.order_paid(p_order_id);
  case v_o.status
    when 'pending_approval' then
      v_out := v_out || 'Đơn đang chờ duyệt giảm giá'::text;
    when 'draft' then
      if v_o.recipient_contact_id is null then v_out := v_out || 'Chưa có người nhận'::text; end if;
    when 'confirmed' then
      if v_paid.confirmed < coalesce(v_o.deposit_min, 0) then
        v_out := v_out || format('Tiền cọc đã xác nhận chưa đủ mức tối thiểu %s đồng',
                                 public.money_text(v_o.deposit_min));
      end if;
      if v_o.backorder_until is null then
        for r in
          select oi.sku, sum(oi.qty) as need, coalesce(max(sl.available), 0) as avail
          from public.order_items oi
          left join public.stock_levels sl on sl.variant_id = oi.variant_id and sl.warehouse_id = v_o.warehouse_id
          where oi.order_id = v_o.id
          group by oi.sku
          having sum(oi.qty) > coalesce(max(sl.available), 0)
        loop
          v_out := v_out || format('Không đủ hàng khả dụng %s ở kho đã chọn: cần %s, còn %s', r.sku, r.need, r.avail);
        end loop;
      end if;
    when 'deposit_paid' then
      if v_paid.confirmed < v_o.total and v_o.cod_approved_at is null then
        v_out := v_out || 'Chưa thu đủ tiền và chưa được duyệt thu khi giao'::text;
      end if;
    when 'ready_to_ship' then
      if v_o.stock_issued_at is null then
        v_out := v_out || 'Chưa ghi sổ phiếu xuất kho, gán serial'::text;
      end if;
    else
      null;
  end case;
  return v_out;
end;
$$;

revoke all on function public.order_blockers(uuid) from public, anon;
grant execute on function public.order_blockers(uuid) to authenticated;

create or replace function public.advance_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_to text;
  v_hold int;
  v_days int;
  v_avail int;
  v_qty int;
  r record;
  v_wcode text;
  v_months int;
  v_no int := 0;
begin
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  v_to := case v_o.status when 'draft' then 'confirmed' when 'confirmed' then 'deposit_paid'
            when 'deposit_paid' then 'ready_to_ship' when 'ready_to_ship' then 'delivering'
            when 'delivering' then 'installed' when 'installed' then 'completed' end;
  if v_to is null then
    raise exception 'no_next_status' using errcode = 'P0001';
  end if;
  -- Bước giao lắp cần delivery.update; các bước còn lại cần quyền sửa đơn.
  if v_to in ('delivering', 'installed', 'completed') then
    if not public.has_perm('delivery.update') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  else
    perform public.assert_order_editor(p_order_id);
  end if;
  if cardinality(public.order_blockers(p_order_id)) > 0 then
    raise exception 'blocked: %', array_to_string(public.order_blockers(p_order_id), '; ') using errcode = 'P0001';
  end if;

  if v_to = 'deposit_paid' then
    -- Giữ hàng cho từng dòng; đặt trước thì chỉ giữ phần đang có.
    select hold_days into v_days from public.sales_settings where showroom_id = v_o.showroom_id;
    for r in select * from public.order_items where order_id = v_o.id loop
      v_avail := 0;
      select coalesce(available, 0) into v_avail from public.stock_levels
      where variant_id = r.variant_id and warehouse_id = v_o.warehouse_id for update;
      v_qty := least(r.qty, greatest(coalesce(v_avail, 0), 0));
      if v_qty > 0 then
        update public.stock_levels set reserved = reserved + v_qty, updated_at = now()
        where variant_id = r.variant_id and warehouse_id = v_o.warehouse_id;
        insert into public.stock_reservations (showroom_id, order_id, order_item_id, variant_id, warehouse_id, qty,
                                               expires_at)
        values (v_o.showroom_id, v_o.id, r.id, r.variant_id, v_o.warehouse_id, v_qty,
                now() + make_interval(days => coalesce(v_days, 14)));
      end if;
    end loop;
    update public.orders set status = v_to, hold_until = now() + make_interval(days => coalesce(v_days, 14))
    where id = v_o.id;
    perform public.sync_lead_from_order(v_o.id, 'deposit');
    perform public.sync_lifecycle_from_order(v_o.id, 'new_customer');
    perform public.fire_order_rules('order_deposit_paid', v_o.id);
  elsif v_to = 'ready_to_ship' then
    update public.orders set status = v_to where id = v_o.id;
    if v_o.cod_approved_at is not null then
      perform public.sync_lead_from_order(v_o.id, 'deposit');
    end if;
  elsif v_to = 'installed' then
    update public.orders set status = v_to where id = v_o.id;
    update public.deliveries set installed_at = coalesce(installed_at, now()), updated_at = now(), updated_by = v_user
    where order_id = v_o.id;
  elsif v_to = 'completed' then
    update public.orders set status = v_to, completed_at = now() where id = v_o.id;
    -- Phiếu bảo hành cho từng sản phẩm (từng serial nếu có); thời hạn theo sản phẩm.
    for r in
      select oi.id as item_id, oi.name, oi.qty, p.warranty_months, su.id as su_id, su.serial
      from public.order_items oi
      join public.product_variants v on v.id = oi.variant_id
      join public.products p on p.id = v.product_id
      left join public.serial_units su on su.order_item_id = oi.id
      where oi.order_id = v_o.id and not oi.is_gift
    loop
      v_no := v_no + 1;
      insert into public.warranties (showroom_id, code, order_id, order_item_id, serial_unit_id, serial, product_name,
                                     owner_contact_id, starts_on, ends_on, created_by)
      values (v_o.showroom_id, 'BH-' || v_o.code || '-' || v_no, v_o.id, r.item_id, r.su_id, r.serial, r.name,
              coalesce(v_o.recipient_contact_id, v_o.buyer_contact_id),
              (now() at time zone 'Asia/Ho_Chi_Minh')::date,
              case when r.warranty_months is null then null
                   else ((now() at time zone 'Asia/Ho_Chi_Minh')::date + make_interval(months => r.warranty_months))::date end,
              v_user);
    end loop;
    -- Nhắc thay vật tư theo consumable_links.
    for r in
      select distinct cl.replacement_cycle_months, cv.sku
      from public.order_items oi
      join public.product_variants v on v.id = oi.variant_id
      join public.consumable_links cl on cl.product_id = v.product_id
      join public.product_variants cv on cv.id = cl.consumable_variant_id
      where oi.order_id = v_o.id
    loop
      insert into public.tasks (showroom_id, type, title, contact_id, lead_id, order_id, assigned_to, due_at, source,
                                rule_key)
      values (v_o.showroom_id, 'consumable_reminder', format('Nhắc thay %s cho khách đơn %s', r.sku, v_o.code),
              coalesce(v_o.recipient_contact_id, v_o.buyer_contact_id), v_o.lead_id, v_o.id, v_o.seller_id,
              now() + make_interval(months => r.replacement_cycle_months), 'rule', 'consumable_reminder');
    end loop;
    perform public.fire_order_rules('order_completed', v_o.id);
    perform public.sync_lead_from_order(v_o.id, 'won');
    perform public.sync_lifecycle_from_order(v_o.id, 'active_owner');
    perform public.order_event(v_o.id, 'warranty_created', jsonb_build_object('count', v_no));
  else
    update public.orders set status = v_to where id = v_o.id;
  end if;

  perform public.order_event(v_o.id, 'order_status_changed', jsonb_build_object('from', v_o.status, 'to', v_to));
  perform public.write_audit('order.advance', 'orders', v_o.id::text,
    jsonb_build_object('code', v_o.code, 'from', v_o.status, 'to', v_to));
  return v_to;
end;
$$;

revoke all on function public.advance_order(uuid) from public, anon;
grant execute on function public.advance_order(uuid) to authenticated;

create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  perform public.assert_writer();
  if not public.has_perm('order.cancel') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 or length(p_reason) > 500 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.status in ('completed', 'cancelled', 'returned') or v_o.stock_issued_at is not null then
    raise exception 'cannot_cancel' using errcode = 'P0001';
  end if;
  perform public.release_order_reservations(v_o.id, 'Hủy đơn');
  update public.orders set status = 'cancelled', cancel_reason = btrim(p_reason), hold_until = null where id = v_o.id;
  -- Đề xuất đang chờ của đơn không còn ý nghĩa.
  perform set_config('app.approval_system', 'on', true);
  update public.approvals set status = 'expired', decision_note = 'Đơn đã hủy'
  where status = 'pending' and ((entity = 'orders' and entity_id = v_o.id)
        or (entity = 'payments' and entity_id in (select id from public.payments where order_id = v_o.id)));
  perform set_config('app.approval_system', '', true);
  update public.payments set status = 'rejected', decision_note = 'Đơn đã hủy'
  where order_id = v_o.id and status = 'recorded';
  perform public.order_event(v_o.id, 'order_status_changed',
                             jsonb_build_object('from', v_o.status, 'to', 'cancelled', 'reason', btrim(p_reason)));
  perform public.write_audit('order.cancel', 'orders', v_o.id::text, jsonb_build_object('code', v_o.code));
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

create or replace function public.set_order_warehouse(p_order_id uuid, p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := public.assert_order_editor(p_order_id);
begin
  if v_o.status not in ('draft', 'pending_approval', 'confirmed') then
    raise exception 'warehouse_locked' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and showroom_id = v_o.showroom_id
                   and is_active and not is_display) then
    raise exception 'warehouse not found' using errcode = 'P0002';
  end if;
  update public.orders set warehouse_id = p_warehouse_id where id = v_o.id;
  perform public.write_audit('order.warehouse', 'orders', v_o.id::text, jsonb_build_object('warehouse_id', p_warehouse_id));
end;
$$;

revoke all on function public.set_order_warehouse(uuid, uuid) from public, anon;
grant execute on function public.set_order_warehouse(uuid, uuid) to authenticated;

create or replace function public.set_order_backorder(p_order_id uuid, p_expected date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  perform public.assert_writer();
  if not public.has_perm('order.allow_backorder') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.status not in ('confirmed', 'deposit_paid') then
    raise exception 'backorder_locked' using errcode = 'P0001';
  end if;
  if p_expected is null or p_expected < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'invalid date' using errcode = '22023';
  end if;
  update public.orders set backorder_until = p_expected where id = v_o.id;
  perform public.write_audit('order.backorder', 'orders', v_o.id::text, jsonb_build_object('expected', p_expected));
end;
$$;

revoke all on function public.set_order_backorder(uuid, date) from public, anon;
grant execute on function public.set_order_backorder(uuid, date) to authenticated;

-- Duyệt thu phần còn lại khi giao: người có payment.confirm, không phải người bán của đơn (trừ Owner).
create or replace function public.approve_cod(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
begin
  if not public.has_perm('payment.confirm') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.seller_id = v_user and not public.is_owner_user(v_user) then
    raise exception 'cannot_self_approve' using errcode = '42501';
  end if;
  if v_o.status not in ('confirmed', 'deposit_paid') then
    raise exception 'cod_locked' using errcode = 'P0001';
  end if;
  update public.orders set cod_approved_at = now(), cod_approved_by = v_user where id = v_o.id;
  perform public.write_audit('order.cod_approve', 'orders', v_o.id::text,
    jsonb_build_object('code', v_o.code, 'self', v_o.seller_id = v_user));
end;
$$;

revoke all on function public.approve_cod(uuid) from public, anon;
grant execute on function public.approve_cod(uuid) to authenticated;

-- Ghi sổ xuất kho giao hàng: nhả giữ hàng, ghi sale_out, gán serial cho hàng có serial.
-- p_serials: {"<order_item_id>": ["SERIAL1", ...]} đủ số lượng cho từng dòng có theo dõi serial.
create or replace function public.issue_order_stock(p_order_id uuid, p_serials jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_doc uuid;
  v_code text;
  r record;
  s text;
  v_su public.serial_units;
  v_list jsonb;
begin
  if not public.has_perm('inventory.post') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.status <> 'ready_to_ship' or v_o.stock_issued_at is not null then
    raise exception 'issue_locked' using errcode = 'P0001';
  end if;
  perform public.release_order_reservations(v_o.id, 'Xuất kho giao hàng');
  v_code := 'PX-' || v_o.code;
  insert into public.stock_documents (showroom_id, code, kind, warehouse_id, reason, status, order_id, created_by,
                                      posted_by, posted_at)
  values (v_o.showroom_id, v_code, 'issue', v_o.warehouse_id, 'Xuất giao đơn ' || v_o.code, 'posted', v_o.id, v_user,
          v_user, now())
  returning id into v_doc;
  for r in
    select oi.*, p.track_serial from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    where oi.order_id = v_o.id
  loop
    insert into public.stock_document_lines (showroom_id, document_id, variant_id, qty)
    values (v_o.showroom_id, v_doc, r.variant_id, r.qty);
    begin
      insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, order_id,
                                          reason, actor_id)
      values (v_o.showroom_id, 'sale_out', r.variant_id, v_o.warehouse_id, r.qty, v_doc, v_o.id,
              'Xuất giao đơn ' || v_o.code, v_user);
    exception when check_violation then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end;
    if r.track_serial then
      v_list := p_serials -> r.id::text;
      if v_list is null or jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) <> r.qty then
        raise exception 'serials_required' using errcode = 'P0001';
      end if;
      for s in select btrim(value) from jsonb_array_elements_text(v_list) loop
        if s = '' then
          raise exception 'serials_required' using errcode = 'P0001';
        end if;
        select * into v_su from public.serial_units where showroom_id = v_o.showroom_id and serial = s for update;
        if found then
          if v_su.variant_id <> r.variant_id or v_su.status not in ('in_stock', 'reserved')
             or v_su.warehouse_id is distinct from v_o.warehouse_id then
            raise exception 'serial_unavailable: %', s using errcode = 'P0001';
          end if;
          update public.serial_units set status = 'sold', order_item_id = r.id where id = v_su.id;
        else
          -- Hàng nhập trước khi có quản lý serial: ghi serial lúc xuất.
          insert into public.serial_units (showroom_id, serial, variant_id, warehouse_id, status, order_item_id)
          values (v_o.showroom_id, s, r.variant_id, v_o.warehouse_id, 'sold', r.id);
        end if;
      end loop;
    end if;
  end loop;
  update public.orders set stock_issued_at = now(), hold_until = null where id = v_o.id;
  perform public.order_event(v_o.id, 'delivery_step', jsonb_build_object('step', 'stock_issued'));
  perform public.write_audit('order.issue_stock', 'orders', v_o.id::text, jsonb_build_object('document', v_code));
  return v_doc;
end;
$$;

revoke all on function public.issue_order_stock(uuid, jsonb) from public, anon;
grant execute on function public.issue_order_stock(uuid, jsonb) to authenticated;

create or replace function public.update_delivery(p_order_id uuid, p_scheduled_on date, p_note text,
                                                  p_handover boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
begin
  if not public.has_perm('delivery.update') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.status in ('cancelled', 'completed', 'returned') then
    raise exception 'delivery_locked' using errcode = 'P0001';
  end if;
  if p_handover and v_o.status <> 'installed' then
    raise exception 'handover_too_early' using errcode = 'P0001';
  end if;
  insert into public.deliveries (order_id, showroom_id) values (v_o.id, v_o.showroom_id) on conflict do nothing;
  update public.deliveries
    set scheduled_on = p_scheduled_on,
        crew_note = nullif(btrim(coalesce(p_note, '')), ''),
        handover_sent_at = case when p_handover then coalesce(handover_sent_at, now()) else handover_sent_at end,
        updated_at = now(), updated_by = v_user
  where order_id = v_o.id;
  perform public.order_event(v_o.id, 'delivery_step',
    jsonb_build_object('step', case when p_handover then 'handover_sent' else 'scheduled' end,
                       'scheduled_on', p_scheduled_on));
end;
$$;

revoke all on function public.update_delivery(uuid, date, text, boolean) from public, anon;
grant execute on function public.update_delivery(uuid, date, text, boolean) to authenticated;

-- Job: quá hạn giữ mà chưa thanh toán đủ thì nhả hàng và báo người bán (CLAUDE.md 8.3).
create or replace function public.release_expired_holds()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select o.* from public.orders o
    where o.status = 'deposit_paid' and o.stock_issued_at is null and o.hold_until is not null
      and o.hold_until < now() and (public.order_paid(o.id)).confirmed < o.total
  loop
    perform public.release_order_reservations(r.id, 'Hết hạn giữ hàng');
    update public.orders set hold_until = null where id = r.id;
    perform public.fire_order_rules('hold_expired', r.id);
    perform public.write_audit('order.hold_expired', 'orders', r.id::text,
      jsonb_build_object('code', r.code, 'showroom_id', r.showroom_id), 'system');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.release_expired_holds() from public, anon, authenticated;

select cron.schedule('release-expired-holds', '7 * * * *', 'select public.release_expired_holds()');

-- ---------------------------------------------------------------------------
-- Thanh toán: ghi nhận, xác nhận (qua hàng chờ duyệt dùng chung), hoàn tiền
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(p_order_id uuid, p_method text, p_amount bigint, p_reference text,
                                                 p_proof_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_paid record;
  v_type text;
  v_id uuid;
begin
  if not public.has_perm('payment.record') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_o := public.assert_order_editor(p_order_id);
  if v_o.status in ('draft', 'pending_approval', 'cancelled', 'completed', 'returned', 'return_requested') then
    raise exception 'payment_locked' using errcode = 'P0001';
  end if;
  if p_method not in ('bank_transfer', 'cash', 'cod') then
    raise exception 'invalid method' using errcode = '22023';
  end if;
  select * into v_paid from public.order_paid(v_o.id);
  if p_amount is null or p_amount <= 0 or p_amount > v_o.total - v_paid.confirmed - v_paid.pending then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_proof_path is not null and p_proof_path not like v_o.showroom_id::text || '/' || v_o.id::text || '/%' then
    raise exception 'invalid proof' using errcode = '22023';
  end if;
  v_type := case when exists (select 1 from public.payments where order_id = v_o.id and status <> 'rejected'
                                and type <> 'refund') then 'balance' else 'deposit' end;
  insert into public.payments (showroom_id, order_id, type, method, amount, reference, proof_path, recorded_by)
  values (v_o.showroom_id, v_o.id, v_type, p_method, p_amount, nullif(btrim(coalesce(p_reference, '')), ''),
          p_proof_path, v_user)
  returning id into v_id;
  insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
  values (v_o.showroom_id, 'payment_confirm', 'payments', v_id, v_user,
          format('%s %s đồng cho đơn %s (%s%s)', case v_type when 'deposit' then 'Cọc' else 'Thanh toán' end,
                 public.money_text(p_amount), v_o.code,
                 case p_method when 'bank_transfer' then 'chuyển khoản' when 'cash' then 'tiền mặt' else 'thu khi giao' end,
                 case when nullif(btrim(coalesce(p_reference, '')), '') is null then ''
                      else ', nội dung "' || btrim(p_reference) || '"' end),
          jsonb_build_object('order_id', v_o.id, 'code', v_o.code, 'amount', p_amount));
  insert into public.notifications (showroom_id, user_id, type, title, link)
  select p.showroom_id, p.id, 'payment_confirm',
         format('Đơn %s có khoản %s đồng chờ xác nhận', v_o.code, public.money_text(p_amount)), '/tasks'
  from public.profiles p
  where p.showroom_id = v_o.showroom_id and p.is_active and p.id <> v_user
    and public.has_perm_for(p.id, 'payment.confirm');
  perform public.order_event(v_o.id, 'payment_recorded', jsonb_build_object('amount', p_amount, 'type', v_type));
  perform public.write_audit('payment.record', 'payments', v_id::text,
    jsonb_build_object('order_id', v_o.id, 'amount', p_amount));
  return v_id;
end;
$$;

revoke all on function public.record_payment(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.record_payment(uuid, text, bigint, text, text) to authenticated;

-- Quyết định xác nhận tiền (guard_approval_decision đã kiểm payment.confirm và chặn người ghi tự xác nhận, trừ
-- Owner): áp vào khoản thanh toán và số đã thu của đơn.
create or replace function public.apply_payment_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
begin
  if new.type <> 'payment_confirm' or new.entity <> 'payments' or new.status = old.status
     or old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return null;
  end if;
  update public.payments
    set status = case when new.status = 'approved' then 'confirmed' else 'rejected' end,
        confirmed_by = case when new.status = 'approved' then auth.uid() end,
        confirmed_at = case when new.status = 'approved' then now() end,
        decision_note = new.decision_note
  where id = new.entity_id and status = 'recorded'
  returning * into v_p;
  if not found then
    return null;
  end if;
  update public.orders set paid_amount = (public.order_paid(v_p.order_id)).confirmed where id = v_p.order_id;
  perform public.order_event(v_p.order_id,
    case when new.status = 'approved' then 'payment_confirmed' else 'payment_rejected' end,
    jsonb_build_object('amount', v_p.amount, 'type', v_p.type));
  if v_p.recorded_by is not null and v_p.recorded_by is distinct from auth.uid() then
    insert into public.notifications (showroom_id, user_id, type, title, link)
    select o.showroom_id, v_p.recorded_by, 'payment_decided',
           format('Khoản %s đồng đơn %s %s', public.money_text(v_p.amount), o.code,
                  case when new.status = 'approved' then 'đã được xác nhận' else 'bị từ chối' end),
           '/orders/' || o.id
    from public.orders o where o.id = v_p.order_id;
  end if;
  return null;
end;
$$;

revoke all on function public.apply_payment_decision() from public, anon, authenticated;

create trigger approvals_payment after update on public.approvals
  for each row execute function public.apply_payment_decision();

create or replace function public.record_refund(p_order_id uuid, p_amount bigint, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_o public.orders;
  v_id uuid;
begin
  if not public.has_perm('payment.refund') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_o from public.orders
  where id = p_order_id and deleted_at is null and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_o.status not in ('cancelled', 'returned') then
    raise exception 'refund_locked' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > (public.order_paid(v_o.id)).confirmed then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.payments (showroom_id, order_id, type, method, amount, reference, status, recorded_by,
                               confirmed_by, confirmed_at)
  values (v_o.showroom_id, v_o.id, 'refund', 'bank_transfer', p_amount,
          coalesce(nullif(btrim(coalesce(p_reference, '')), ''), 'Hoàn tiền ' || v_o.code), 'confirmed', v_user,
          v_user, now())
  returning id into v_id;
  update public.orders set paid_amount = (public.order_paid(v_o.id)).confirmed where id = v_o.id;
  perform public.order_event(v_o.id, 'payment_recorded', jsonb_build_object('amount', p_amount, 'type', 'refund'));
  perform public.write_audit('payment.refund', 'payments', v_id::text,
    jsonb_build_object('order_id', v_o.id, 'amount', p_amount));
  return v_id;
end;
$$;

revoke all on function public.record_refund(uuid, bigint, text) from public, anon;
grant execute on function public.record_refund(uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Phiếu kho
-- ---------------------------------------------------------------------------

-- p: {kind, warehouse_id, to_warehouse_id?, reason, lines: [{variant_id, qty?, counted?, serials?: []}]}
create or replace function public.save_stock_document(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_kind text := p ->> 'kind';
  v_id uuid;
  v_no int;
  v_l jsonb;
  v_prefix text;
begin
  if not public.has_perm('inventory.document') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_kind not in ('receipt', 'issue', 'transfer', 'count') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if not exists (select 1 from public.warehouses where id = (p ->> 'warehouse_id')::uuid and showroom_id = v_showroom) then
    raise exception 'warehouse not found' using errcode = 'P0002';
  end if;
  if v_kind = 'transfer' and not exists (
      select 1 from public.warehouses where id = (p ->> 'to_warehouse_id')::uuid and showroom_id = v_showroom
        and id <> (p ->> 'warehouse_id')::uuid) then
    raise exception 'invalid target warehouse' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0
     or jsonb_array_length(p -> 'lines') > 200 then
    raise exception 'no lines' using errcode = '22023';
  end if;
  v_prefix := case v_kind when 'receipt' then 'PN' when 'issue' then 'PX' when 'transfer' then 'PC' else 'KK' end;
  select count(*) + 1 into v_no from public.stock_documents where showroom_id = v_showroom and kind = v_kind;
  insert into public.stock_documents (showroom_id, code, kind, warehouse_id, to_warehouse_id, reason, created_by)
  values (v_showroom, v_prefix || '-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' ||
          lpad(v_no::text, 3, '0'), v_kind, (p ->> 'warehouse_id')::uuid,
          case when v_kind = 'transfer' then (p ->> 'to_warehouse_id')::uuid end,
          nullif(btrim(coalesce(p ->> 'reason', '')), ''), v_user)
  returning id into v_id;
  for v_l in select * from jsonb_array_elements(p -> 'lines') loop
    if not exists (select 1 from public.product_variants where id = (v_l ->> 'variant_id')::uuid
                     and showroom_id = v_showroom) then
      raise exception 'variant not found' using errcode = '22023';
    end if;
    if v_kind = 'count' then
      if (v_l ->> 'counted') is null or (v_l ->> 'counted')::int < 0 then
        raise exception 'invalid count' using errcode = '22023';
      end if;
    elsif (v_l ->> 'qty') is null or (v_l ->> 'qty')::int < 1 then
      raise exception 'invalid qty' using errcode = '22023';
    end if;
    insert into public.stock_document_lines (showroom_id, document_id, variant_id, qty, counted, serials)
    values (v_showroom, v_id, (v_l ->> 'variant_id')::uuid,
            case when v_kind <> 'count' then (v_l ->> 'qty')::int end,
            case when v_kind = 'count' then (v_l ->> 'counted')::int end,
            coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(v_l -> 'serials', '[]'::jsonb)) x
                      where btrim(x) <> ''), '{}'));
  end loop;
  perform public.write_audit('stock.document_create', 'stock_documents', v_id::text, jsonb_build_object('kind', v_kind));
  return v_id;
end;
$$;

revoke all on function public.save_stock_document(jsonb) from public, anon;
grant execute on function public.save_stock_document(jsonb) to authenticated;

-- Ghi sổ các dòng của phiếu (dùng chung cho ghi sổ thường và kiểm kê đã duyệt).
create or replace function public.post_stock_lines(p_doc_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.stock_documents;
  l record;
  v_diff int;
  s text;
begin
  select * into d from public.stock_documents where id = p_doc_id for update;
  for l in select * from public.stock_document_lines where document_id = d.id loop
    if d.kind = 'receipt' then
      insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, reason, actor_id)
      values (d.showroom_id, 'receipt', l.variant_id, d.warehouse_id, l.qty, d.id, d.reason, p_actor);
      foreach s in array l.serials loop
        insert into public.serial_units (showroom_id, serial, variant_id, warehouse_id)
        values (d.showroom_id, s, l.variant_id, d.warehouse_id);
      end loop;
    elsif d.kind = 'issue' then
      insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, reason, actor_id)
      values (d.showroom_id, case when exists (select 1 from public.warehouses where id = d.warehouse_id and is_display)
                                  then 'demo_out' else 'adjust_minus' end,
              l.variant_id, d.warehouse_id, l.qty, d.id, d.reason, p_actor);
    elsif d.kind = 'transfer' then
      insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, reason, actor_id)
      values (d.showroom_id, 'transfer_out', l.variant_id, d.warehouse_id, l.qty, d.id, d.reason, p_actor),
             (d.showroom_id, 'transfer_in', l.variant_id, d.to_warehouse_id, l.qty, d.id, d.reason, p_actor);
      update public.serial_units set warehouse_id = d.to_warehouse_id
      where showroom_id = d.showroom_id and serial = any(l.serials) and warehouse_id = d.warehouse_id
        and status = 'in_stock';
    else
      v_diff := l.counted - coalesce(l.expected, 0);
      if v_diff > 0 then
        insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, reason, actor_id)
        values (d.showroom_id, 'adjust_plus', l.variant_id, d.warehouse_id, v_diff, d.id, 'Kiểm kê: ' || coalesce(d.reason, ''), p_actor);
      elsif v_diff < 0 then
        insert into public.stock_movements (showroom_id, type, variant_id, warehouse_id, qty, document_id, reason, actor_id)
        values (d.showroom_id, 'adjust_minus', l.variant_id, d.warehouse_id, -v_diff, d.id, 'Kiểm kê: ' || coalesce(d.reason, ''), p_actor);
      end if;
    end if;
  end loop;
  update public.stock_documents set status = 'posted', posted_by = p_actor, posted_at = now() where id = d.id;
end;
$$;

revoke all on function public.post_stock_lines(uuid, uuid) from public, anon, authenticated;

-- Ghi sổ phiếu. Kiểm kê có chênh lệch thì vào hàng chờ duyệt (inventory.count_approve) thay vì ghi ngay.
create or replace function public.post_stock_document(p_doc_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  d public.stock_documents;
  v_diff int := 0;
begin
  if not public.has_perm('inventory.post') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into d from public.stock_documents
  where id = p_doc_id and showroom_id = public.current_showroom_id() for update;
  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if d.status <> 'draft' then
    raise exception 'document_locked' using errcode = 'P0001';
  end if;
  if d.kind = 'count' then
    update public.stock_document_lines l
      set expected = coalesce((select on_hand from public.stock_levels sl
                               where sl.variant_id = l.variant_id and sl.warehouse_id = d.warehouse_id), 0)
      where document_id = d.id;
    select count(*) into v_diff from public.stock_document_lines where document_id = d.id and counted <> expected;
    if v_diff > 0 then
      update public.stock_documents set status = 'pending_approval' where id = d.id;
      insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason, payload)
      values (d.showroom_id, 'stock_count', 'stock_documents', d.id, v_user,
              format('Phiếu kiểm kê %s lệch %s SKU so với sổ', d.code, v_diff),
              jsonb_build_object('code', d.code));
      perform public.write_audit('stock.count_submit', 'stock_documents', d.id::text, jsonb_build_object('diff', v_diff));
      return 'pending_approval';
    end if;
  end if;
  begin
    perform public.post_stock_lines(d.id, v_user);
  exception
    when check_violation then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    when unique_violation then
      raise exception 'serial_exists' using errcode = 'P0001';
  end;
  perform public.write_audit('stock.document_post', 'stock_documents', d.id::text, jsonb_build_object('code', d.code));
  return 'posted';
end;
$$;

revoke all on function public.post_stock_document(uuid) from public, anon;
grant execute on function public.post_stock_document(uuid) to authenticated;

create or replace function public.cancel_stock_document(p_doc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_writer();
  if not public.has_perm('inventory.document') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.stock_documents set status = 'cancelled'
  where id = p_doc_id and showroom_id = public.current_showroom_id() and status = 'draft';
  if not found then
    raise exception 'document_locked' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.cancel_stock_document(uuid) from public, anon;
grant execute on function public.cancel_stock_document(uuid) to authenticated;

create or replace function public.apply_stock_count_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'stock_count' or new.entity <> 'stock_documents' or new.status = old.status
     or old.status <> 'pending' then
    return null;
  end if;
  if new.status = 'approved' then
    perform public.post_stock_lines(new.entity_id, auth.uid());
  elsif new.status in ('rejected', 'expired') then
    update public.stock_documents set status = 'cancelled' where id = new.entity_id and status = 'pending_approval';
  end if;
  return null;
end;
$$;

revoke all on function public.apply_stock_count_decision() from public, anon, authenticated;

create trigger approvals_stock_count after update on public.approvals
  for each row execute function public.apply_stock_count_decision();

create or replace function public.set_low_stock_threshold(p_variant_id uuid, p_warehouse_id uuid, p_threshold int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_writer();
  if not public.has_perm('product.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_threshold is not null and p_threshold < 0 then
    raise exception 'invalid threshold' using errcode = '22023';
  end if;
  insert into public.stock_levels (showroom_id, variant_id, warehouse_id, low_threshold)
  select w.showroom_id, p_variant_id, w.id, p_threshold
  from public.warehouses w where w.id = p_warehouse_id and w.showroom_id = public.current_showroom_id()
  on conflict (variant_id, warehouse_id) do update set low_threshold = excluded.low_threshold, updated_at = now();
end;
$$;

revoke all on function public.set_low_stock_threshold(uuid, uuid, int) from public, anon;
grant execute on function public.set_low_stock_threshold(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Sản phẩm, giá
-- ---------------------------------------------------------------------------

-- p: {id?, sku, name, category_id?, brand?, description?, warranty_months?, requires_installation?,
--     installation_crew_size?, delivery_class?, track_serial?, is_sellable?, is_gift_only?, status?}
-- Mỗi sản phẩm một SKU (phiên bản màu sắc làm sau). Trả về id SKU.
create or replace function public.save_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_variant uuid := nullif(p ->> 'id', '')::uuid;
  v_product uuid;
  v_sku text := upper(btrim(coalesce(p ->> 'sku', '')));
begin
  if not public.has_perm('product.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_sku) not between 1 and 60 or length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 200 then
    raise exception 'invalid product' using errcode = '22023';
  end if;
  if coalesce(p ->> 'delivery_class', 'parcel') not in ('parcel', 'bulky') then
    raise exception 'invalid product' using errcode = '22023';
  end if;
  if exists (select 1 from public.product_variants where showroom_id = v_showroom and sku = v_sku
               and id is distinct from v_variant) then
    raise exception 'sku_taken' using errcode = 'P0001';
  end if;
  if v_variant is null then
    insert into public.products (showroom_id, created_by, name) values (v_showroom, v_user, btrim(p ->> 'name'))
    returning id into v_product;
    insert into public.product_variants (showroom_id, product_id, sku, created_by)
    values (v_showroom, v_product, v_sku, v_user) returning id into v_variant;
  else
    select product_id into v_product from public.product_variants where id = v_variant and showroom_id = v_showroom;
    if v_product is null then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
    update public.product_variants set sku = v_sku,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active) where id = v_variant;
  end if;
  update public.products set
    name = btrim(p ->> 'name'),
    category_id = case when p ? 'category_id' then nullif(p ->> 'category_id', '')::uuid else category_id end,
    brand = case when p ? 'brand' then nullif(btrim(p ->> 'brand'), '') else brand end,
    description = case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else description end,
    warranty_months = case when p ? 'warranty_months' then nullif(p ->> 'warranty_months', '')::int else warranty_months end,
    requires_installation = coalesce((p ->> 'requires_installation')::boolean, requires_installation),
    installation_crew_size = case when p ? 'installation_crew_size'
                                  then nullif(p ->> 'installation_crew_size', '')::int else installation_crew_size end,
    delivery_class = coalesce(p ->> 'delivery_class', delivery_class),
    track_serial = coalesce((p ->> 'track_serial')::boolean, track_serial),
    is_sellable = coalesce((p ->> 'is_sellable')::boolean, is_sellable),
    is_gift_only = coalesce((p ->> 'is_gift_only')::boolean, is_gift_only),
    status = coalesce(p ->> 'status', status)
  where id = v_product;
  perform public.write_audit('product.save', 'products', v_product::text, jsonb_build_object('sku', v_sku));
  return v_variant;
end;
$$;

revoke all on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;

-- Đổi giá: thêm dòng mới vào bảng giá mặc định, lịch sử giữ nguyên. Đơn cũ đã chụp giá nên không đổi.
create or replace function public.set_price(p_variant_id uuid, p_price bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
  v_showroom uuid := public.current_showroom_id();
  v_list uuid;
begin
  if not public.has_perm('price.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_price is null or p_price < 0 or p_price > 10000000000 then
    raise exception 'invalid price' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id and showroom_id = v_showroom) then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  select id into v_list from public.price_lists where showroom_id = v_showroom and is_default;
  if v_list is null then
    insert into public.price_lists (showroom_id, name, is_default, created_by)
    values (v_showroom, 'Giá bán lẻ', true, v_user) returning id into v_list;
  end if;
  if public.current_price(p_variant_id) is distinct from p_price then
    insert into public.price_list_items (showroom_id, price_list_id, variant_id, price, created_by)
    values (v_showroom, v_list, p_variant_id, p_price, v_user);
    perform public.write_audit('price.set', 'product_variants', p_variant_id::text, jsonb_build_object('price', p_price));
  end if;
end;
$$;

revoke all on function public.set_price(uuid, bigint) from public, anon;
grant execute on function public.set_price(uuid, bigint) to authenticated;

-- Cài đặt bán hàng (CLAUDE.md 11.2: settings.integrations, mặc định chỉ Owner).
create or replace function public.save_sales_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_writer();
begin
  if not public.has_perm('settings.integrations') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.sales_settings set
    deposit_min_amount = coalesce((p ->> 'deposit_min_amount')::bigint, deposit_min_amount),
    deposit_min_pct = coalesce((p ->> 'deposit_min_pct')::numeric, deposit_min_pct),
    hold_days = coalesce((p ->> 'hold_days')::int, hold_days),
    quote_valid_days = coalesce((p ->> 'quote_valid_days')::int, quote_valid_days),
    post_delivery_call_days = coalesce((p ->> 'post_delivery_call_days')::int, post_delivery_call_days),
    bank_info = case when p ? 'bank_info' then nullif(btrim(p ->> 'bank_info'), '') else bank_info end,
    updated_at = now(), updated_by = v_user
  where showroom_id = public.current_showroom_id();
  -- Gọi hỏi thăm sau giao: số ngày đi theo luật sinh việc.
  if p ? 'post_delivery_call_days' then
    update public.task_rules set due_offset = make_interval(days => (p ->> 'post_delivery_call_days')::int)
    where showroom_id = public.current_showroom_id() and rule_key = 'post_delivery_call';
  end if;
  perform public.write_audit('settings.sales', 'sales_settings', public.current_showroom_id()::text, p);
end;
$$;

revoke all on function public.save_sales_settings(jsonb) from public, anon;
grant execute on function public.save_sales_settings(jsonb) to authenticated;

-- Giới hạn giảm tay theo vai trò; null là bỏ giới hạn (vai trò đó tự áp mọi mức giảm).
create or replace function public.save_discount_limit(p_role_id uuid, p_max_pct numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_writer();
  if not public.has_perm('settings.integrations') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and showroom_id = public.current_showroom_id()) then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  if p_max_pct is null then
    delete from public.discount_limits where role_id = p_role_id;
  elsif p_max_pct < 0 or p_max_pct > 100 then
    raise exception 'invalid pct' using errcode = '22023';
  else
    insert into public.discount_limits (showroom_id, role_id, max_pct)
    values (public.current_showroom_id(), p_role_id, p_max_pct)
    on conflict (showroom_id, role_id) do update set max_pct = excluded.max_pct, updated_at = now();
  end if;
  perform public.write_audit('settings.discount_limit', 'roles', p_role_id::text, jsonb_build_object('max_pct', p_max_pct));
end;
$$;

revoke all on function public.save_discount_limit(uuid, numeric) from public, anon;
grant execute on function public.save_discount_limit(uuid, numeric) to authenticated;
