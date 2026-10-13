-- Phân quyền chạy nhanh (Owner 12/10/2026: CRM tải chậm, nhất là Hội thoại, "không như Pancake").
--
-- Đo trên máy dev: mỗi lần gọi has_perm, effective_uid, current_showroom_id mất khoảng 1 ms (effective_uid đọc phiên
-- "Xem như" qua hàm có khối bắt lỗi, mỗi lần mở một giao dịch con), và chính sách RLS gọi các hàm này cho TỪNG DÒNG:
-- đọc 85 hội thoại mất 160 ms, đọc tin của danh sách hội thoại 240 ms, 74 sự kiện 160 ms; dữ liệu càng nhiều càng chậm.
--
-- Sửa, KHÔNG đổi ai được xem gì:
-- 1. view_as_header không còn khối bắt lỗi; effective_uid trả ngay auth.uid() khi không có phiên "Xem như".
-- 2. Hàm kiểm theo dòng (can_view_lead, can_view_contact, can_view_order, can_see_conversation) có bản *_ctx trong
--    schema private (không mở qua API) nhận sẵn quyền và người dùng; bản cũ giữ nguyên tên, gọi bản *_ctx nên mọi hàm
--    đang dùng chúng vẫn chạy y như trước.
-- 3. Mọi chính sách RLS trong schema public được viết lại để phần "người này có quyền gì" tính MỘT lần cho cả câu lệnh
--    (bọc trong (select ...), cách Supabase khuyến nghị), phần còn lại theo dòng chỉ là tra chỉ mục.
-- Kiểm thử RLS (supabase/tests) chạy lại toàn bộ để chắc quyền không đổi.

-- ---------------------------------------------------------------------------
-- 1. Người đang dùng: nhanh khi không "Xem như"
-- ---------------------------------------------------------------------------

create or replace function public.view_as_header()
returns uuid
language sql
stable
set search_path = ''
as $fn$
  select case
    when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid
  end
  from (select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-view-as' as h) s;
$fn$;

create or replace function public.effective_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when public.view_as_header() is null then auth.uid()
    else coalesce((public.active_view_as()).target_id, auth.uid())
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Kiểm theo dòng nhận sẵn quyền (schema private: chính sách gọi được, API không gọi được)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.can_view_lead_ctx(
  p_lead_id uuid, p_showroom uuid, p_uid uuid, p_all boolean, p_own boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.deleted_at is null
      and l.showroom_id = p_showroom
      and (p_all or (p_own and l.assigned_to = p_uid))
  );
$fn$;

create or replace function private.can_view_order_ctx(
  p_order_id uuid, p_showroom uuid, p_uid uuid, p_all boolean, p_own boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.deleted_at is null
      and o.showroom_id = p_showroom
      and (p_all or (p_own and o.seller_id = p_uid))
  );
$fn$;

create or replace function private.can_view_contact_ctx(
  p_contact_id uuid, p_showroom uuid, p_uid uuid,
  p_lead_all boolean, p_lead_own boolean, p_order_all boolean, p_order_own boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.contacts c
    where c.id = p_contact_id
      and c.deleted_at is null
      and c.showroom_id = p_showroom
      and (
        p_lead_all
        or (
          p_lead_own
          and (
            exists (
              select 1 from public.leads l
              where l.deleted_at is null
                and l.assigned_to = p_uid
                and (l.contact_id = c.id or l.recipient_contact_id = c.id)
            )
            or exists (
              select 1 from public.conversations cv
              where cv.contact_id = c.id and cv.lead_id is null and cv.assigned_to = p_uid
            )
          )
        )
        or (
          p_order_all
          and exists (
            select 1 from public.orders o
            where o.deleted_at is null and (o.buyer_contact_id = c.id or o.recipient_contact_id = c.id)
          )
        )
        or (
          p_order_own
          and exists (
            select 1 from public.orders o
            where o.deleted_at is null and o.seller_id = p_uid
              and (o.buyer_contact_id = c.id or o.recipient_contact_id = c.id)
          )
        )
      )
  );
$fn$;

create or replace function private.can_see_conversation_ctx(
  p_row_showroom uuid, p_lead_id uuid, p_assigned_to uuid,
  p_showroom uuid, p_uid uuid, p_view_all boolean, p_lead_own boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_row_showroom = p_showroom
    and (
      p_view_all
      or (
        p_lead_own
        and (
          (
            p_lead_id is not null
            and exists (
              select 1 from public.leads l
              where l.id = p_lead_id and l.deleted_at is null and l.assigned_to = p_uid
            )
          )
          or (p_lead_id is null and p_assigned_to = p_uid)
        )
      )
    );
$fn$;

revoke all on function private.can_view_lead_ctx(uuid, uuid, uuid, boolean, boolean) from public, anon;
revoke all on function private.can_view_order_ctx(uuid, uuid, uuid, boolean, boolean) from public, anon;
revoke all on function private.can_view_contact_ctx(uuid, uuid, uuid, boolean, boolean, boolean, boolean)
  from public, anon;
revoke all on function private.can_see_conversation_ctx(uuid, uuid, uuid, uuid, uuid, boolean, boolean)
  from public, anon;
grant execute on function private.can_view_lead_ctx(uuid, uuid, uuid, boolean, boolean) to authenticated;
grant execute on function private.can_view_order_ctx(uuid, uuid, uuid, boolean, boolean) to authenticated;
grant execute on function private.can_view_contact_ctx(uuid, uuid, uuid, boolean, boolean, boolean, boolean)
  to authenticated;
grant execute on function private.can_see_conversation_ctx(uuid, uuid, uuid, uuid, uuid, boolean, boolean)
  to authenticated;

-- Bản cũ giữ tên và kết quả, gọi bản *_ctx (một nguồn luật).
create or replace function public.can_view_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.can_view_lead_ctx(
    p_lead_id, public.current_showroom_id(), public.effective_uid(),
    public.has_perm('lead.view_all'), public.has_perm('lead.view_own')
  );
$fn$;

create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.can_view_order_ctx(
    p_order_id, public.current_showroom_id(), public.effective_uid(),
    public.has_perm('order.view_all'), public.has_perm('order.view_own')
  );
$fn$;

create or replace function public.can_view_contact(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.can_view_contact_ctx(
    p_contact_id, public.current_showroom_id(), public.effective_uid(),
    public.has_perm('lead.view_all'), public.has_perm('lead.view_own'),
    public.has_perm('order.view_all'), public.has_perm('order.view_own')
  );
$fn$;

create or replace function public.can_see_conversation(p_conversation public.conversations)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.can_see_conversation_ctx(
    p_conversation.showroom_id, p_conversation.lead_id, p_conversation.assigned_to,
    public.current_showroom_id(), public.effective_uid(),
    public.has_perm('message.view_all'), public.has_perm('lead.view_own')
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Viết lại chính sách RLS: phần theo người dùng tính một lần cho cả câu lệnh
-- ---------------------------------------------------------------------------

create or replace function pg_temp.rls_fast(e text)
returns text
language sql
immutable
as $fn$
  select
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(e,
      -- Quyền với tên cố định: tính một lần.
      '(public\.)?has_perm\(''([a-z_.]+)''::text\)', '(select public.has_perm(''\2''))', 'g'),
      '(public\.)?current_showroom_id\(\)', '(select public.current_showroom_id())', 'g'),
      '(public\.)?effective_uid\(\)', '(select public.effective_uid())', 'g'),
      'auth\.uid\(\)', '(select auth.uid())', 'g'),
      -- Kiểm theo dòng: truyền sẵn người dùng và quyền.
      '(public\.)?can_view_lead\(([a-z_.]+)\)',
      'private.can_view_lead_ctx(\2, (select public.current_showroom_id()), (select public.effective_uid()), '
      || '(select public.has_perm(''lead.view_all'')), (select public.has_perm(''lead.view_own'')))', 'g'),
      '(public\.)?can_view_order\(([a-z_.]+)\)',
      'private.can_view_order_ctx(\2, (select public.current_showroom_id()), (select public.effective_uid()), '
      || '(select public.has_perm(''order.view_all'')), (select public.has_perm(''order.view_own'')))', 'g'),
      '(public\.)?can_view_contact\(([a-z_.]+)\)',
      'private.can_view_contact_ctx(\2, (select public.current_showroom_id()), (select public.effective_uid()), '
      || '(select public.has_perm(''lead.view_all'')), (select public.has_perm(''lead.view_own'')), '
      || '(select public.has_perm(''order.view_all'')), (select public.has_perm(''order.view_own'')))', 'g'),
      '(public\.)?can_see_conversation\(([a-z_]+)\.\*\)',
      'private.can_see_conversation_ctx(\2.showroom_id, \2.lead_id, \2.assigned_to, '
      || '(select public.current_showroom_id()), (select public.effective_uid()), '
      || '(select public.has_perm(''message.view_all'')), (select public.has_perm(''lead.view_own'')))', 'g');
$fn$;

do $do$
declare
  r record;
  q text;
  c text;
  n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := pg_temp.rls_fast(r.qual);
    c := pg_temp.rls_fast(r.with_check);
    if q is not distinct from r.qual and c is not distinct from r.with_check then
      continue;
    end if;
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    elsif c is null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    elsif q is null then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    else
      execute format(
        'alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c
      );
    end if;
    n := n + 1;
  end loop;
  raise notice 'rls_fast: % chính sách đã viết lại', n;
end;
$do$;

-- HẾT FILE
