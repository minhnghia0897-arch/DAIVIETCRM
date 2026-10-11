-- Kiểm thử bộ nối Messenger (supabase/migrations/20261008000200_messenger.sql).
-- Chạy: pnpm test:rls. Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, An …0004 (cả hai đang trực).
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

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

-- Một tin Messenger vào hộp nhận thô như route handler ghi.
create function pg_temp.hook(mid text, psid text, body text, page text default '111', echo boolean default false,
                             meta text default null, valid boolean default true)
returns bigint language sql as $$
  insert into public.webhook_events (provider, external_id, event_type, signature_valid, payload)
  values ('meta_messenger', mid, case when echo then 'message_echo' else 'message' end, valid,
    jsonb_build_object('page_id', page, 'item', jsonb_build_object(
      'sender', jsonb_build_object('id', case when echo then page else psid end),
      'recipient', jsonb_build_object('id', case when echo then psid else page end),
      'timestamp', (extract(epoch from now()) * 1000)::bigint,
      'message', jsonb_strip_nulls(jsonb_build_object('mid', mid, 'text', body,
        'is_echo', case when echo then true end, 'metadata', meta)))))
  returning id;
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;

insert into public.integrations (showroom_id, key, status, enabled, reply_mode, config)
values ('4a000000-0000-4000-8000-000000000004', 'meta_messenger', 'connected', true, 'crm', '{"pageId":"111"}');

-- ---------------------------------------------------------------------------
-- Nhận tin
-- ---------------------------------------------------------------------------
select is(public.process_messenger_event(pg_temp.hook('m.1', '9001', 'Chào shop, ghế DV-X9 giá bao nhiêu?'), 'Trần Mai'),
  'processed', 'tin đầu từ người lạ được xử lý');
insert into t select 'conv', id::text from public.conversations where external_user_id = '9001';
insert into t select 'lead', lead_id::text from public.conversations where external_user_id = '9001';
insert into t select 'holder', assigned_to::text from public.leads where id = (select v::uuid from t where k = 'lead');

select is((select c.full_name from public.contacts c join public.contact_identities ci on ci.contact_id = c.id
           where ci.type = 'fb_psid' and ci.value = '9001'), 'Trần Mai', 'tạo khách có định danh Facebook');
select is((select source from public.leads where id = (select v::uuid from t where k = 'lead')), 'meta_messenger',
  'tạo lead nguồn Tin nhắn Facebook');
select ok((select v from t where k = 'holder') in ('11111111-1111-4111-8111-000000000003',
                                                   '11111111-1111-4111-8111-000000000004'),
  'lead được phân cho người đang trực');
select ok(exists (select 1 from public.consents c join public.conversations v on v.contact_id = c.contact_id
                  where v.external_user_id = '9001' and c.purpose = 'care' and c.channel = 'messenger' and c.granted),
  'ghi căn cứ chăm sóc trên kênh Messenger');
select ok(not exists (select 1 from public.events where type = 'messenger_in' and payload::text like '%DV-X9%'),
  'sự kiện không chứa nội dung tin');
select is((select unread_count from public.conversations where external_user_id = '9001'), 1, 'một tin chưa đọc');
select is(public.process_messenger_event((select id from public.webhook_events where external_id = 'm.1')),
  'skipped', 'tin đã xử lý không xử lý lại');

select is(public.process_messenger_event(pg_temp.hook('m.2', '9001', 'Shop ơi')), 'processed', 'tin thứ hai');
select is((select count(*)::int from public.leads where contact_id =
           (select contact_id from public.conversations where external_user_id = '9001')), 1,
  'tin tiếp theo không tạo lead mới');
select is((select unread_count from public.conversations where external_user_id = '9001'), 2, 'hai tin chưa đọc');
select is((select count(*)::int from public.notifications where type = 'message_in'), 0,
  'không báo lại khi hội thoại đang có tin chưa đọc');

select is(public.process_messenger_event(pg_temp.hook('m.3', '9002', 'x', page => '999')), 'ignored',
  'Page chưa kết nối thì bỏ qua');
select is(public.process_messenger_event(pg_temp.hook('m.4', '9003', 'x', valid => false)), 'skipped',
  'chữ ký sai thì không xử lý');
select is((select status from public.webhook_events where external_id = 'm.4'), 'received',
  'tin chữ ký sai giữ nguyên trong hộp nhận thô');

-- ---------------------------------------------------------------------------
-- Ai xem được
-- ---------------------------------------------------------------------------
select pg_temp.login((select v::uuid from t where k = 'holder'));
select is((select count(*)::int from public.conversations where external_user_id = '9001'), 1,
  'người giữ lead thấy hội thoại');
select is((select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
           where c.external_user_id = '9001'), 2, 'người giữ lead đọc được tin');
select throws_ok($$ insert into public.messages (showroom_id, conversation_id, direction, text)
                    select showroom_id, id, 'out', 'x' from public.conversations limit 1 $$,
  '42501', null, 'không ghi tin thẳng vào bảng');
select pg_temp.login(case when (select v from t where k = 'holder') = '11111111-1111-4111-8111-000000000003'
                     then '11111111-1111-4111-8111-000000000004'::uuid
                     else '11111111-1111-4111-8111-000000000003'::uuid end);
select is((select count(*)::int from public.conversations), 0, 'telesale khác không thấy hội thoại');
select is((select count(*)::int from public.messages), 0, 'telesale khác không đọc được tin');
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  'P0002', null, 'telesale khác không trả lời được');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select is((select count(*)::int from public.conversations), 1, 'sale admin (message.view_all) thấy hội thoại');

-- ---------------------------------------------------------------------------
-- Trả lời
-- ---------------------------------------------------------------------------
select pg_temp.login((select v::uuid from t where k = 'holder'));
select public.mark_conversation_read((select v::uuid from t where k = 'conv'));
select is((select unread_count from public.conversations where external_user_id = '9001'), 0, 'đánh dấu đã đọc');

insert into t select 'r1', public.queue_messenger_reply((select v::uuid from t where k = 'conv'), '  Dạ em chào chị  ')::text;
select is((select v::jsonb ->> 'messaging_type' from t where k = 'r1'), 'RESPONSE', 'trong 24 giờ gửi dạng trả lời');
select is((select v::jsonb ->> 'psid' from t where k = 'r1'), '9001', 'trả về PSID để server gửi');
select is((select status || '|' || text from public.messages where id = (select (v::jsonb ->> 'message_id')::uuid from t where k = 'r1')),
  'queued|Dạ em chào chị', 'tin chờ gửi, bỏ khoảng trắng thừa');
select throws_ok(format($$ select public.queue_messenger_reply(%L, '   ') $$, (select v from t where k = 'conv')),
  '22023', 'empty_text', 'không gửi tin rỗng');

select pg_temp.logout();
select public.finish_messenger_reply((select (v::jsonb ->> 'message_id')::uuid from t where k = 'r1'), 'm.out.1');
select is((select status from public.messages where external_message_id = 'm.out.1'), 'sent', 'gửi xong ghi mã tin');
select ok((select first_contact_at is not null and stage = 'contacted' from public.leads
           where id = (select v::uuid from t where k = 'lead')), 'tin đi đầu tiên dừng SLA, lead sang Đã liên hệ');
select is((select actor_id::text from public.events where type = 'messenger_out'
           and lead_id = (select v::uuid from t where k = 'lead')), (select v from t where k = 'holder'),
  'sự kiện tin đi ghi người gửi');

-- Bản sao "echo" của tin CRM gửi không tạo tin thứ hai.
select is(public.process_messenger_event(pg_temp.hook('m.out.1', '9001', 'Dạ em chào chị', echo => true,
  meta => 'crm:' || (select v::jsonb ->> 'message_id' from t where k = 'r1'))), 'duplicate', 'echo của tin CRM đã gửi được nhận ra');
select is((select count(*)::int from public.messages where direction = 'out'), 1, 'echo không nhân đôi tin');
-- Nhân viên trả lời thẳng trên Page: ghi lại tin đi.
select public.process_messenger_event(pg_temp.hook('m.out.2', '9001', 'Trả lời từ Page', echo => true));
select is((select sent_via from public.messages where external_message_id = 'm.out.2'), 'page',
  'tin trả lời trên Page được ghi lại');

-- Khung giờ.
update public.conversations set last_inbound_at = now() - interval '2 days' where external_user_id = '9001';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  'P0001', 'human_agent_only', 'quá 24 giờ chỉ trả lời tay bằng Human Agent');
select is((public.queue_messenger_reply((select v::uuid from t where k = 'conv'), 'chào', true)) ->> 'tag',
  'HUMAN_AGENT', 'trong 7 ngày gửi được với thẻ Human Agent');
select pg_temp.logout();
update public.conversations set last_inbound_at = now() - interval '8 days' where external_user_id = '9001';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào', true) $$, (select v from t where k = 'conv')),
  'P0001', 'window_closed', 'quá 7 ngày không nhắn được');

-- Chế độ trả lời, đồng ý, quyền.
select pg_temp.logout();
update public.conversations set last_inbound_at = now() where external_user_id = '9001';
update public.integrations set reply_mode = 'external' where key = 'meta_messenger';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  'P0001', 'reply_mode_external', 'kênh trả lời ở công cụ khác thì CRM chỉ đọc');
select pg_temp.logout();
update public.integrations set reply_mode = 'crm' where key = 'meta_messenger';
update public.consents set withdrawn_at = now()
where contact_id = (select contact_id from public.conversations where external_user_id = '9001');
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  'P0001', 'consent_blocked', 'khách rút đồng ý thì không nhắn');
select pg_temp.logout();
update public.consents set withdrawn_at = null
where contact_id = (select contact_id from public.conversations where external_user_id = '9001');
insert into public.user_permission_overrides (user_id, permission_key, effect, set_by)
select v::uuid, 'message.messenger_send', 'revoke', '11111111-1111-4111-8111-000000000001' from t where k = 'holder';
select pg_temp.login((select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.queue_messenger_reply(%L, 'chào') $$, (select v from t where k = 'conv')),
  '42501', null, 'bị thu quyền gửi Messenger thì không gửi được');

-- Tạm dừng: tin giữ lại, chạy lại thì xử lý tiếp.
select pg_temp.logout();
update public.integrations set status = 'paused' where key = 'meta_messenger';
select is(public.process_messenger_event(pg_temp.hook('m.5', '9001', 'còn đó không')), 'paused',
  'đang tạm dừng thì chưa xử lý');
select is((select status from public.webhook_events where external_id = 'm.5'), 'received', 'tin vẫn chờ trong hộp nhận');

select * from finish();
rollback;
