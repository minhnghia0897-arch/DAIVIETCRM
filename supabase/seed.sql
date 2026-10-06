-- Dữ liệu giả cho môi trường dev. Không chạy trên môi trường thật. Mật khẩu chung: matkhau-dev-123
-- Dữ liệu tham chiếu (quyền, vai trò, danh mục) nằm ở migration 20261004000400_reference_data.sql.

do $$
declare
  v_showroom uuid := '4a000000-0000-4000-8000-000000000004';
  v_users jsonb := '[
    {"id": "11111111-1111-4111-8111-000000000001", "email": "owner@example.test", "name": "Hà Owner", "role": "owner"},
    {"id": "11111111-1111-4111-8111-000000000002", "email": "saleadmin@example.test", "name": "Minh Sale admin", "role": "sale_admin"},
    {"id": "11111111-1111-4111-8111-000000000003", "email": "thao@example.test", "name": "Thảo", "role": "telesale"},
    {"id": "11111111-1111-4111-8111-000000000004", "email": "an@example.test", "name": "An", "role": "telesale"}
  ]';
  u jsonb;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', (u ->> 'id')::uuid, 'authenticated', 'authenticated',
      u ->> 'email', extensions.crypt('matkhau-dev-123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u ->> 'name'),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), (u ->> 'id')::uuid, u ->> 'id',
      jsonb_build_object('sub', u ->> 'id', 'email', u ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    );
    insert into public.profiles (id, showroom_id, full_name, role_id)
    select (u ->> 'id')::uuid, v_showroom, u ->> 'name', r.id
    from public.roles r where r.showroom_id = v_showroom and r.key = u ->> 'role';
  end loop;
end;
$$;

-- Khách và lead giả.
insert into public.contacts (id, showroom_id, full_name, country_of_residence, city, province) values
  ('22222222-2222-4222-8222-000000000001', '4a000000-0000-4000-8000-000000000004', 'Nguyễn Thị Thu', 'KR', 'Daegu', null),
  ('22222222-2222-4222-8222-000000000002', '4a000000-0000-4000-8000-000000000004', 'Nguyễn Văn Lực', 'VN', 'Diễn Châu', 'Nghệ An'),
  ('22222222-2222-4222-8222-000000000003', '4a000000-0000-4000-8000-000000000004', 'Phạm Ngọc Lan', 'VN', 'Quận 4', 'TP.HCM'),
  ('22222222-2222-4222-8222-000000000004', '4a000000-0000-4000-8000-000000000004', 'Lê Hoàng Phúc', 'KR', 'Incheon', null);

insert into public.contact_identities (showroom_id, contact_id, type, value, value_raw, display_masked, is_primary, source) values
  ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000001', 'phone', '+821012342290', '010-1234-2290', '+82 10••••2290', true, 'meta_lead_ads'),
  ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002', 'phone', '+84901234215', '0901234215', '090•••215', true, 'call'),
  ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000003', 'phone', '+84911234630', '0911 234 630', '091•••630', true, 'walk_in'),
  ('4a000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000004', 'phone', '+821055555103', '+82 10 5555 5103', '+82 10••••5103', true, 'meta_lead_ads');

insert into public.leads (id, showroom_id, contact_id, recipient_contact_id, keep_surprise, source, assigned_to, sla_due_at) values
  ('33333333-3333-4333-8333-000000000001', '4a000000-0000-4000-8000-000000000004',
   '22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-000000000002', true,
   'meta_lead_ads', '11111111-1111-4111-8111-000000000003', now() + interval '5 minutes'),
  ('33333333-3333-4333-8333-000000000002', '4a000000-0000-4000-8000-000000000004',
   '22222222-2222-4222-8222-000000000003', '22222222-2222-4222-8222-000000000003', false,
   'walk_in', '11111111-1111-4111-8111-000000000004', now() + interval '5 minutes'),
  ('33333333-3333-4333-8333-000000000003', '4a000000-0000-4000-8000-000000000004',
   '22222222-2222-4222-8222-000000000004', null, false,
   'meta_lead_ads', null, null);

-- Việc và đề xuất giả cho màn Việc cần làm: việc gọi đầu của Thảo, hẹn gọi lại của An, một việc ở hàng chung, và
-- một đề xuất giảm giá của An chờ Owner duyệt.
insert into public.tasks (id, showroom_id, type, title, contact_id, lead_id, assigned_to, due_at, priority, source) values
  ('44444444-4444-4444-8444-000000000001', '4a000000-0000-4000-8000-000000000004', 'first_contact',
   'Gọi lead mới từ Form Facebook', '22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000001',
   '11111111-1111-4111-8111-000000000003', now() + interval '5 minutes', 1, 'rule'),
  ('44444444-4444-4444-8444-000000000002', '4a000000-0000-4000-8000-000000000004', 'callback',
   'Gọi lại theo hẹn', '22222222-2222-4222-8222-000000000003', '33333333-3333-4333-8333-000000000002',
   '11111111-1111-4111-8111-000000000004', now() + interval '2 hours', 2, 'user'),
  ('44444444-4444-4444-8444-000000000003', '4a000000-0000-4000-8000-000000000004', 'data_fix',
   'Kiểm tra số khách ở Hàn', '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000003',
   null, now() + interval '1 day', 2, 'rule');

insert into public.approvals (showroom_id, type, entity, entity_id, requested_by, reason) values
  ('4a000000-0000-4000-8000-000000000004', 'discount', 'lead', '33333333-3333-4333-8333-000000000002',
   '11111111-1111-4111-8111-000000000004', 'Giảm 7% cho khách quen, vượt mức 5% của telesale');

-- Nhóm Telegram giả cho màn Nhóm nội bộ: một nhóm đang dùng, một nhóm bot vừa vào chưa gán, một nhóm bot đã rời.
-- chat_id âm là nhóm, đúng như Telegram đánh số.
insert into public.telegram_groups (showroom_id, chat_id, title, purpose, status, assigned_by, assigned_at) values
  ('4a000000-0000-4000-8000-000000000004', -1001000000001, 'Cả đội Showroom Q4', 'announce', 'active',
   '11111111-1111-4111-8111-000000000001', now() - interval '3 days'),
  ('4a000000-0000-4000-8000-000000000004', -1001000000002, 'Kho & giao lắp', 'delivery', 'active',
   '11111111-1111-4111-8111-000000000001', now() - interval '2 days'),
  ('4a000000-0000-4000-8000-000000000004', -1001000000003, 'Telesale', 'unused', 'pending', null, null),
  ('4a000000-0000-4000-8000-000000000004', -1001000000004, 'Nhóm cũ 2025', 'general', 'lost',
   '11111111-1111-4111-8111-000000000001', now() - interval '60 days'),
  ('4a000000-0000-4000-8000-000000000004', -1001000000005, 'Nhóm thử phân công', 'unused', 'inactive',
   null, null);

insert into public.telegram_messages (showroom_id, chat_id, message_id, event_type, created_at) values
  ('4a000000-0000-4000-8000-000000000004', -1001000000001, 9001, 'lead_created', now() - interval '2 hours'),
  ('4a000000-0000-4000-8000-000000000004', -1001000000001, 9002, 'lead_created', now() - interval '40 minutes');

-- Tên bot giả, để màn Cài đặt → Thông báo Telegram dựng được link liên kết trong môi trường dev.
-- Môi trường thật: Owner điền ở Cài đặt → Tích hợp, token và mã bí mật webhook vào Supabase Vault.
insert into public.integrations (showroom_id, key, config) values
  ('4a000000-0000-4000-8000-000000000004', 'telegram_bot', '{"botUsername": "DaiVietQ4Bot"}'::jsonb)
on conflict (showroom_id, key) do update set config = excluded.config;
