-- Kiểm thử bộ nối Zalo OA (supabase/migrations/20261009000100_zalo_oa.sql).
-- Chạy: pnpm test:rls. Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, An …0004 (cả hai đang trực).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.method', 'POST', true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Một sự kiện Zalo OA vào hộp nhận thô như route handler ghi.
create function pg_temp.zalo(event text, mid text, uid text, body text, oa text default '4318',
                             info jsonb default null, valid boolean default true, ago interval default '0')
returns bigint language sql as $$
  insert into public.webhook_events (provider, external_id, event_type, signature_valid, payload)
  values ('zalo_oa', coalesce(mid, event || ':' || uid || ':' || gen_random_uuid()), event, valid,
    jsonb_strip_nulls(jsonb_build_object(
      'app_id', '99', 'event_name', event,
      'timestamp', ((extract(epoch from now() - ago)) * 1000)::bigint::text,
      'sender', jsonb_build_object('id', case when event like 'oa\_%' then oa else uid end),
      'recipient', jsonb_build_object('id', case when event like 'oa\_%' then uid else oa end),
      'message', case when mid is null then null else jsonb_strip_nulls(jsonb_build_object('msg_id', mid, 'text', body)) end,
      'info', info)))
  returning id;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;

insert into public.integrations (showroom_id, key, status, enabled, reply_mode, config)
values ('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 'connected', true, 'crm', '{"oaId":"4318"}');

-- ---------------------------------------------------------------------------
-- Nhận tin
-- ---------------------------------------------------------------------------
select is(public.process_zalo_event(pg_temp.zalo('user_send_text', 'z.1', '7001', 'Shop ơi ghế còn không'), 'Lê Hoa'),
  'processed', 'tin đầu từ người lạ được xử lý');
insert into t select 'conv', id::text from public.conversations where external_user_id = '7001';
insert into t select 'holder', l.assigned_to::text from public.conversations c join public.leads l on l.id = c.lead_id
  where c.external_user_id = '7001';
select is((select c.full_name from public.contacts c join public.contact_identities ci on ci.contact_id = c.id
           where ci.type = 'zalo_user_id' and ci.value = '7001'), 'Lê Hoa', 'tạo khách có định danh Zalo');
select is((select l.source from public.conversations c join public.leads l on l.id = c.lead_id
           where c.external_user_id = '7001'), 'zalo_oa', 'tạo lead nguồn Zalo OA');
select ok((select v from t where k = 'holder') is not null, 'lead được phân cho người đang trực');
select ok(exists (select 1 from public.consents c join public.conversations v on v.contact_id = c.contact_id
                  where v.external_user_id = '7001' and c.purpose = 'care' and c.channel = 'zalo_oa' and c.granted),
  'ghi căn cứ chăm sóc trên Zalo OA');
select ok(exists (select 1 from public.events where type = 'zalo_in'), 'ghi sự kiện zalo_in');
select ok(not exists (select 1 from public.events where type = 'zalo_in' and payload::text like '%ghế%'),
  'sự kiện không chứa nội dung tin');
select is(public.process_zalo_event(pg_temp.zalo('user_seen_message', null, '7001', null)), 'ignored',
  'sự kiện đã xem bỏ qua');
select is(public.process_zalo_event(pg_temp.zalo('user_send_text', 'z.2', '7002', 'x', oa => '999')), 'ignored',
  'OA chưa kết nối thì bỏ qua');
select is(public.process_zalo_event(pg_temp.zalo('user_send_text', 'z.3', '7003', 'x', valid => false)), 'skipped',
  'chữ ký sai thì không xử lý');

-- Khách chia sẻ thông tin: thêm số vào hồ sơ, đổi tên tạm.
select public.process_zalo_event(pg_temp.zalo('user_send_text', 'z.4', '7004', 'Chào'));
select is(public.process_zalo_event(pg_temp.zalo('user_submit_info', null, '7004', null,
  info => '{"name":"Trần Văn Bình","phone":"0901234999"}'), null,
  '{"raw":"0901234999","e164":"+84901234999","masked":"090•••999","valid":true,"country":"VN"}'), 'processed',
  'khách gửi form thông tin');
select is((select c.full_name || '|' || c.country_of_residence from public.contacts c
           join public.conversations v on v.contact_id = c.id where v.external_user_id = '7004'),
  'Trần Văn Bình|VN', 'tên tạm đổi thành tên khách gửi, thị trường theo đầu số');
select ok(exists (select 1 from public.contact_identities ci join public.conversations v on v.contact_id = ci.contact_id
                  where v.external_user_id = '7004' and ci.type = 'phone' and ci.value = '+84901234999'),
  'số khách chia sẻ thành định danh');
select ok(not exists (select 1 from public.events where type = 'identity_added' and payload::text like '%0901234999%'),
  'sự kiện không chứa số điện thoại');
-- Số đã thuộc khách khác (Nguyễn Văn Lực trong seed): không gộp, tạo việc kiểm tra.
select public.process_zalo_event(pg_temp.zalo('user_submit_info', null, '7004', null,
  info => '{"phone":"0901234215"}'), null,
  '{"raw":"0901234215","e164":"+84901234215","masked":"090•••215","valid":true}');
select is((select count(*)::int from public.contact_identities where value = '+84901234215'), 1,
  'số của khách khác không bị gộp');
select ok(exists (select 1 from public.tasks where rule_key = 'zalo_phone_conflict'), 'tạo việc kiểm tra gộp hồ sơ');

-- ---------------------------------------------------------------------------
-- Trả lời
-- ---------------------------------------------------------------------------
select pg_temp.login((select v::uuid from t where k = 'holder'));
insert into t select 'r1', public.queue_zalo_reply((select v::uuid from t where k = 'conv'), 'Dạ còn ạ')::text;
select is((select v::jsonb ->> 'paid' from t where k = 'r1'), 'false', 'trong 48 giờ là tin miễn phí');
select is((select v::jsonb ->> 'user_id' from t where k = 'r1'), '7001', 'trả về mã người dùng Zalo');
select pg_temp.logout();
-- Zalo gửi bản sao tin OA vừa gửi trước khi CRM ghi kết quả: nhận ra theo nội dung, không nhân đôi.
select is(public.process_zalo_event(pg_temp.zalo('oa_send_text', 'z.out.1', '7001', 'Dạ còn ạ')), 'processed',
  'bản sao tin OA');
select is((select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
           where c.external_user_id = '7001' and m.direction = 'out'), 1, 'bản sao không nhân đôi tin');
select public.finish_channel_reply((select (v::jsonb ->> 'message_id')::uuid from t where k = 'r1'), 'z.out.1');
select is((select status from public.messages where external_message_id = 'z.out.1'), 'sent', 'tin đã gửi');
select ok((select first_contact_at is not null and stage = 'contacted' from public.leads l
           join public.conversations c on c.lead_id = l.id where c.external_user_id = '7001'),
  'tin đi đầu tiên dừng SLA');
select is((select actor_id::text from public.events where type = 'zalo_out' and actor_type = 'user'
           and payload ->> 'message_id' = (select v::jsonb ->> 'message_id' from t where k = 'r1')),
  (select v from t where k = 'holder'), 'sự kiện tin đi ghi người gửi');
-- Nhân viên trả lời thẳng trên OA: ghi lại tin đi.
select public.process_zalo_event(pg_temp.zalo('oa_send_text', 'z.out.2', '7001', 'Trả lời trên app OA'));
select is((select sent_via from public.messages where external_message_id = 'z.out.2'), 'page',
  'tin trả lời trên OA được ghi lại');

-- Ngoài 48 giờ: phải xác nhận tin tính phí.
update public.conversations set last_inbound_at = now() - interval '3 days' where external_user_id = '7001';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_zalo_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  'P0001', 'paid_confirm_required', 'ngoài 48 giờ phải xác nhận tin tính phí');
select is((public.queue_zalo_reply((select v::uuid from t where k = 'conv'), 'chào', true)) ->> 'paid', 'true',
  'xác nhận thì gửi được, đánh dấu tin tính phí');
select is((select count(*)::int from public.messages where tag = 'paid'), 1, 'đếm được tin tính phí');

-- Quyền, người khác.
select pg_temp.login(case when (select v from t where k = 'holder') = '11111111-1111-4111-8111-000000000003'
                     then '11111111-1111-4111-8111-000000000004'::uuid
                     else '11111111-1111-4111-8111-000000000003'::uuid end);
select throws_ok(format($$ select public.queue_zalo_reply(%L, 'chào', true) $$, (select v from t where k = 'conv')),
  'P0002', null, 'telesale không giữ lead không trả lời được');
select pg_temp.logout();
update public.integrations set reply_mode = 'external' where key = 'zalo_oa';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_zalo_reply(%L, 'chào', true) $$, (select v from t where k = 'conv')),
  'P0001', 'reply_mode_external', 'kênh trả lời ở công cụ khác thì CRM chỉ đọc');

-- Khóa làm mới token: chỉ một tiến trình giữ được.
select pg_temp.logout();
select ok(public.lease_token_refresh('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 60), 'lấy được khóa làm mới');
select ok(not public.lease_token_refresh('4a000000-0000-4000-8000-000000000004', 'zalo_oa', 60),
  'tiến trình thứ hai không lấy được');

select * from finish();
rollback;
