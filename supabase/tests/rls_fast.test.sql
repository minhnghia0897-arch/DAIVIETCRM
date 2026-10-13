-- Kiểm thử phân quyền chạy nhanh (migration 20261012000600_rls_fast.sql): chính sách RLS tính "người này có quyền gì"
-- một lần cho cả câu lệnh, không gọi lại cho từng dòng. Chính sách mới viết theo cách cũ thì kiểm thử này báo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Bỏ các lời gọi đã bọc (select ...), phần còn lại không được gọi hàm kiểm quyền theo dòng. Ngoại lệ duy nhất:
-- approvals đọc quyền theo loại đề xuất của từng dòng (has_perm(approval_permission(type))).
select is(
  (
    select coalesce(string_agg(p.tablename || '.' || p.policyname, ', '), '')
    from pg_policies p,
      lateral (
        select regexp_replace(
          coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
          '\( SELECT (public\.)?(has_perm\(''[a-z_.]+''::text\)|current_showroom_id\(\)|effective_uid\(\)|auth\.uid\(\)) AS [a-z_]+\)',
          '',
          'g'
        ) as e
      ) x
    where p.schemaname = 'public'
      and x.e ~ '(has_perm\(''|current_showroom_id\(\)|effective_uid\(\)|auth\.uid\(\)|can_view_lead\(|can_view_order\(|can_view_contact\(|can_see_conversation\()'
  ),
  '',
  'mọi chính sách RLS bọc hàm kiểm quyền trong (select ...) và dùng bản *_ctx cho phần theo dòng'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'khách chưa đăng nhập không dùng được schema private'
);

select ok(
  not has_function_privilege('anon', 'private.can_view_lead_ctx(uuid, uuid, uuid, boolean, boolean)', 'EXECUTE'),
  'khách chưa đăng nhập không gọi được hàm kiểm theo dòng'
);

-- "Xem như" vẫn đổi người hiệu lực; không có phiên thì là chính mình. Mã sai dạng trong header không làm lỗi câu lệnh.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}', true);
select set_config('request.headers', '{"x-view-as":"khong-phai-uuid"}', true);
select is(public.effective_uid(), '11111111-1111-4111-8111-000000000002'::uuid, 'mã "Xem như" sai dạng: vẫn là chính mình');
select set_config('request.headers', '{}', true);
select is(public.effective_uid(), '11111111-1111-4111-8111-000000000002'::uuid, 'không "Xem như": là chính mình');

select * from finish();
rollback;
