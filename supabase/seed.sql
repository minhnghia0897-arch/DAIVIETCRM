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
