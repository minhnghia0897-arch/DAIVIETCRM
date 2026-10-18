-- Số điện thoại hiện đầy đủ theo quyền (Owner chốt 18/10/2026: "số điện thoại để thông tin công khai, không ẩn nữa
-- để dễ nhìn check quản lý").
--
-- Ai thấy số đầy đủ ngay trên màn, không cần bấm:
-- - Người có contact.phone_reveal (mặc định Owner, Sale admin): số của mọi khách mình xem được.
-- - Người có contact.phone_reveal_assigned (mặc định Telesale): số của người đặt và người nhận thuộc lead đang giao cho
--   mình, đúng luật của reveal_identity; lead chuyển đi thì lần tải sau thấy lại bản che.
-- - Người nhận của lead, đơn đang mở bật Giữ bất ngờ: bản che với mọi người, kể cả Owner.
-- - Người khác: bản che như cũ.
-- Database quyết định (view chạy dưới quyền chủ view, không mở bảng contact_identities cho người không có quyền), nên
-- số đầy đủ không xuống trình duyệt của người không được xem. Tin Telegram vẫn ghi số che (đọc display_masked).
-- Nút Gọi vẫn đi qua reveal_identity và ghi nhật ký mỗi lần gọi.

create or replace function private.phone_visible_ctx(
  p_contact_id uuid, p_uid uuid, p_all boolean, p_assigned boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    -- Giữ bất ngờ: người nhận của lead, đơn đang mở mà người đặt chưa cho phép liên hệ.
    not exists (
      select 1 from public.leads l
      where l.recipient_contact_id = p_contact_id and l.contact_id <> p_contact_id and l.keep_surprise
        and l.deleted_at is null and l.stage not in ('won', 'lost')
    )
    and not exists (
      select 1 from public.orders o
      where o.recipient_contact_id = p_contact_id and o.buyer_contact_id <> p_contact_id and o.keep_surprise
        and o.deleted_at is null and o.status not in ('completed', 'cancelled', 'returned')
    )
    and (
      p_all
      or (
        p_assigned and p_uid is not null and exists (
          select 1 from public.leads l
          where l.assigned_to = p_uid and l.deleted_at is null
            and (l.contact_id = p_contact_id or (l.recipient_contact_id = p_contact_id and not l.keep_surprise))
        )
      )
    );
$fn$;

revoke all on function private.phone_visible_ctx(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function private.phone_visible_ctx(uuid, uuid, boolean, boolean) to authenticated;

-- Thêm hai cột vào cuối view (giữ nguyên các cột cũ): display là số đầy đủ khi được xem, không thì bản che; is_full
-- cho biết đang là số đầy đủ. Quyền của người dùng tính một lần cho cả câu lệnh.
create or replace view public.contact_identity_display as
  select ci.id, ci.showroom_id, ci.contact_id, ci.type, ci.display_masked, ci.is_primary, ci.is_valid, ci.verified_at,
         case when f.full then ci.value else ci.display_masked end as display,
         f.full as is_full
  from public.contact_identities ci
  cross join lateral (
    select ci.type = 'phone' and private.phone_visible_ctx(
      ci.contact_id,
      (select public.effective_uid()),
      (select public.has_perm('contact.phone_reveal')),
      (select public.has_perm('contact.phone_reveal_assigned'))
    ) as full
  ) f
  where public.can_view_contact(ci.contact_id);

grant select on public.contact_identity_display to authenticated;
