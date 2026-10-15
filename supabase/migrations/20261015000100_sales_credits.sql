-- Doanh số từng sale và chỉ tiêu tháng (Owner chốt 15/10/2026; CLAUDE.md mục 9.3, 9.4).
--
-- Quy tắc Owner chốt:
--   1. Doanh số của một đơn = tiền hàng sau giảm giá (subtotal − discount). Không tính phí giao, phí lắp; quà tặng 0đ
--      tự nhiên không cộng gì.
--   2. Ghi cho người bán trên đơn (orders.seller_id) vào tháng khách cọc xong: đơn chuyển sang Đã cọc, hoặc đi thẳng các
--      bước sau (được duyệt thu khi giao, thanh toán đủ một lần). Mỗi đơn ghi đúng một lần.
--   3. Đơn đã tính mà sau đó bị hủy hoặc khách trả hàng: ghi một dòng âm vào tháng bị hủy; số các tháng trước giữ
--      nguyên, không tự đổi.
--   4. Chỉ tiêu doanh số tháng của từng người do Owner đặt (quyền target.manage); KPI so doanh số với chỉ tiêu.
--
-- Sổ doanh số chỉ thêm, không sửa, không xóa (như stock_movements): người không ghi trực tiếp được, chỉ trigger trên
-- orders ghi. Tháng tính theo múi giờ của showroom.

-- ---------------------------------------------------------------------------
-- Sổ doanh số
-- ---------------------------------------------------------------------------

create table public.sales_credits (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  order_id uuid not null references public.orders (id),
  seller_id uuid references public.profiles (id),
  kind text not null check (kind in ('sale', 'reversal')),
  amount bigint not null,
  reason text,
  credited_at timestamptz not null default now(),
  month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (order_id, kind),
  check ((kind = 'sale' and amount >= 0) or (kind = 'reversal' and amount <= 0)),
  check (month = date_trunc('month', month)::date)
);

create index sales_credits_month_idx on public.sales_credits (showroom_id, month, seller_id);
create index sales_credits_seller_idx on public.sales_credits (seller_id, month);

comment on table public.sales_credits is
  'Sổ doanh số từng sale: một dòng khi đơn cọc xong, một dòng âm khi đơn đã tính bị hủy hoặc trả hàng. Chỉ thêm.';

-- Ai xem được doanh số, chỉ tiêu của một người: chính mình (kpi.own); người đặt chỉ tiêu (target.manage, mặc định chỉ
-- Owner) xem mọi người; quản lý (kpi.team) xem người không phải quản lý (không xem chỉ số của Owner, sale admin khác,
-- CLAUDE.md mục 5). Dạng *_ctx nhận quyền đã tính sẵn để chính sách RLS chỉ tính quyền một lần cho cả câu lệnh.
create or replace function private.sales_visible_ctx(
  p_user uuid, p_uid uuid, p_own boolean, p_all boolean, p_team boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_user is not null and (
    (p_user = p_uid and p_own)
    or p_all
    or (p_team and not public.has_perm_for(p_user, 'kpi.team'))
  );
$fn$;

revoke all on function private.sales_visible_ctx(uuid, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function private.sales_visible_ctx(uuid, uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.can_view_sales_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.sales_visible_ctx(p_user, public.effective_uid(), public.has_perm('kpi.own'),
                                   public.has_perm('target.manage'), public.has_perm('kpi.team'));
$fn$;

revoke all on function public.can_view_sales_of(uuid) from public, anon;
grant execute on function public.can_view_sales_of(uuid) to authenticated;

alter table public.sales_credits enable row level security;

-- Xem được dòng doanh số khi xem được người bán (theo luật trên) hoặc xem được chính đơn đó (hồ sơ đơn hiện doanh số
-- của đơn; ai xem được đơn vốn đã thấy người bán và tiền của đơn).
create policy sales_credits_select on public.sales_credits for select to authenticated
  using (
    showroom_id = (select public.current_showroom_id())
    and (
      private.sales_visible_ctx(seller_id, (select public.effective_uid()), (select public.has_perm('kpi.own')),
                                (select public.has_perm('target.manage')), (select public.has_perm('kpi.team')))
      or private.can_view_order_ctx(order_id, (select public.current_showroom_id()), (select public.effective_uid()),
                                    (select public.has_perm('order.view_all')), (select public.has_perm('order.view_own')))
    )
  );

revoke insert, update, delete on public.sales_credits from authenticated, anon;

create or replace function public.sales_credits_immutable()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception 'sales credits are append-only' using errcode = '42501';
end;
$fn$;

create trigger sales_credits_no_update before update or delete on public.sales_credits
  for each row execute function public.sales_credits_immutable();

-- Đầu tháng theo múi giờ showroom (mặc định giờ VN).
create or replace function public.sales_month(p_showroom uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $fn$
  select date_trunc('month', p_at at time zone coalesce(
    (select s.timezone from public.showrooms s where s.id = p_showroom), 'Asia/Ho_Chi_Minh'))::date;
$fn$;

-- Ghi doanh số theo trạng thái đơn. Chạy với quyền của hàm (người không ghi trực tiếp vào sổ được).
create or replace function public.orders_sales_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_sale public.sales_credits;
  v_now timestamptz := now();
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status in ('deposit_paid', 'ready_to_ship', 'delivering', 'installed', 'completed') then
    insert into public.sales_credits (showroom_id, order_id, seller_id, kind, amount, credited_at, month, created_by)
    values (new.showroom_id, new.id, new.seller_id, 'sale', greatest(new.subtotal - new.discount, 0), v_now,
            public.sales_month(new.showroom_id, v_now), auth.uid())
    on conflict (order_id, kind) do nothing;
  elsif new.status in ('cancelled', 'returned') then
    select * into v_sale from public.sales_credits where order_id = new.id and kind = 'sale';
    if found then
      insert into public.sales_credits (showroom_id, order_id, seller_id, kind, amount, reason, credited_at, month,
                                        created_by)
      values (new.showroom_id, new.id, v_sale.seller_id, 'reversal', -v_sale.amount,
              case new.status when 'cancelled' then 'Hủy đơn' else 'Khách trả hàng' end, v_now,
              public.sales_month(new.showroom_id, v_now), auth.uid())
      on conflict (order_id, kind) do nothing;
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function public.orders_sales_credit() from public, anon, authenticated;

create trigger orders_sales_credit after insert or update of status on public.orders
  for each row execute function public.orders_sales_credit();

-- Đơn có sẵn trước migration: ghi lại theo lịch sử trạng thái (sự kiện order_status_changed); không có sự kiện thì lấy
-- giờ cập nhật đơn gần nhất.
with credited as (
  select o.*,
         coalesce(
           (select min(e.occurred_at) from public.events e
            where e.order_id = o.id and e.type = 'order_status_changed'
              and e.payload ->> 'to' in ('deposit_paid', 'ready_to_ship', 'delivering', 'installed', 'completed')),
           case when o.status in ('deposit_paid', 'ready_to_ship', 'delivering', 'installed', 'completed')
                then o.updated_at end
         ) as sold_at
  from public.orders o
)
insert into public.sales_credits (showroom_id, order_id, seller_id, kind, amount, credited_at, month)
select c.showroom_id, c.id, c.seller_id, 'sale', greatest(c.subtotal - c.discount, 0), c.sold_at,
       public.sales_month(c.showroom_id, c.sold_at)
from credited c
where c.sold_at is not null
on conflict (order_id, kind) do nothing;

insert into public.sales_credits (showroom_id, order_id, seller_id, kind, amount, reason, credited_at, month)
select o.showroom_id, o.id, s.seller_id, 'reversal', -s.amount,
       case o.status when 'cancelled' then 'Hủy đơn' else 'Khách trả hàng' end, x.at,
       public.sales_month(o.showroom_id, x.at)
from public.orders o
join public.sales_credits s on s.order_id = o.id and s.kind = 'sale'
cross join lateral (
  select coalesce(
    (select max(e.occurred_at) from public.events e
     where e.order_id = o.id and e.type = 'order_status_changed' and e.payload ->> 'to' = o.status),
    o.updated_at) as at
) x
where o.status in ('cancelled', 'returned')
on conflict (order_id, kind) do nothing;

-- ---------------------------------------------------------------------------
-- Chỉ tiêu (CLAUDE.md mục 9.3). Giai đoạn này chỉ có chỉ tiêu doanh số tháng (metric_key revenue_deposit).
-- ---------------------------------------------------------------------------

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  user_id uuid not null references public.profiles (id),
  period text not null check (period in ('week', 'month')),
  period_start date not null,
  metric_key text not null check (metric_key in ('revenue_deposit')),
  target_value bigint not null check (target_value > 0 and target_value <= 1000000000000),
  set_by uuid,
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (showroom_id, user_id, period, period_start, metric_key)
);

alter table public.targets enable row level security;

create policy targets_select on public.targets for select to authenticated
  using (
    showroom_id = (select public.current_showroom_id())
    and private.sales_visible_ctx(user_id, (select public.effective_uid()), (select public.has_perm('kpi.own')),
                                  (select public.has_perm('target.manage')), (select public.has_perm('kpi.team')))
  );

revoke insert, update, delete on public.targets from authenticated, anon;

-- Đặt, sửa, xóa (giá trị rỗng hoặc 0) chỉ tiêu doanh số tháng của một người. Ghi nhật ký kiểm toán trước và sau.
create or replace function public.set_sales_target(p_user uuid, p_month date, p_value bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_showroom uuid := public.current_showroom_id();
  v_month date := date_trunc('month', p_month)::date;
  v_before bigint;
begin
  if auth.uid() is null or not public.has_perm('target.manage') then
    raise exception 'not allowed to set targets' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if p_month is null or p_value < 0 or p_value > 1000000000000 then
    raise exception 'invalid target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.showroom_id = v_showroom) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select target_value into v_before from public.targets
  where showroom_id = v_showroom and user_id = p_user and period = 'month' and period_start = v_month
    and metric_key = 'revenue_deposit';

  if coalesce(p_value, 0) = 0 then
    delete from public.targets
    where showroom_id = v_showroom and user_id = p_user and period = 'month' and period_start = v_month
      and metric_key = 'revenue_deposit';
  else
    insert into public.targets (showroom_id, user_id, period, period_start, metric_key, target_value, set_by,
                                created_by)
    values (v_showroom, p_user, 'month', v_month, 'revenue_deposit', p_value, auth.uid(), auth.uid())
    on conflict (showroom_id, user_id, period, period_start, metric_key)
    do update set target_value = excluded.target_value, set_by = excluded.set_by, set_at = now(),
                  updated_at = now();
  end if;

  perform public.write_audit('target.set', 'targets', p_user::text,
    jsonb_build_object('month', v_month, 'metric', 'revenue_deposit', 'before', v_before,
                       'after', nullif(coalesce(p_value, 0), 0)));
end;
$fn$;

revoke all on function public.set_sales_target(uuid, date, bigint) from public, anon;
grant execute on function public.set_sales_target(uuid, date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- KPI doanh số một tháng: mỗi người người hỏi được xem (người bán được, hoặc đã có doanh số, chỉ tiêu trong tháng).
-- ---------------------------------------------------------------------------

create or replace function public.sales_kpi_month(p_month date)
returns table (user_id uuid, full_name text, sold bigint, reversed bigint, net bigint, orders int, target bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with m as (
    select date_trunc('month', p_month)::date as month, public.current_showroom_id() as showroom
  ),
  people as (
    select p.id, p.full_name
    from public.profiles p, m
    where p.showroom_id = m.showroom
      and public.can_view_sales_of(p.id)
      and (
        (p.is_active and public.has_perm_for(p.id, 'order.create'))
        or exists (select 1 from public.sales_credits c
                   where c.showroom_id = m.showroom and c.seller_id = p.id and c.month = m.month)
        or exists (select 1 from public.targets t
                   where t.showroom_id = m.showroom and t.user_id = p.id and t.period = 'month'
                     and t.period_start = m.month and t.metric_key = 'revenue_deposit')
      )
  )
  select pe.id,
         pe.full_name,
         coalesce(sum(c.amount) filter (where c.kind = 'sale'), 0)::bigint,
         coalesce(sum(c.amount) filter (where c.kind = 'reversal'), 0)::bigint,
         coalesce(sum(c.amount), 0)::bigint,
         (count(c.id) filter (where c.kind = 'sale'))::int,
         (select t.target_value from public.targets t
          where t.showroom_id = m.showroom and t.user_id = pe.id and t.period = 'month'
            and t.period_start = m.month and t.metric_key = 'revenue_deposit')
  from people pe
  cross join m
  left join public.sales_credits c on c.showroom_id = m.showroom and c.seller_id = pe.id and c.month = m.month
  group by pe.id, pe.full_name, m.month, m.showroom
  order by 5 desc, 2;
$fn$;

revoke all on function public.sales_kpi_month(date) from public, anon;
grant execute on function public.sales_kpi_month(date) to authenticated;

-- HẾT FILE
