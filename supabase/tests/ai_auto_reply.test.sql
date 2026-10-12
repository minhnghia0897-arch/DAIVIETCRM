-- Kiểm thử AI tự trả lời (supabase/migrations/20261012000300_ai_auto_reply.sql): AI phụ trách hội thoại trên kênh Owner
-- bật, không báo nhân viên từng tin, mỗi tin chỉ một lượt, tin AI không làm AI dừng và không tính là nhân viên đã liên
-- hệ, nhân viên gửi tin (CRM hoặc thẳng trên Page) thì AI dừng, chuyển người tự thành lead và tính SLA, Tiếp quản và Trả
-- lại AI theo quyền, hết ngân sách, kiến thức chỉ Owner thấy.
-- Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, An …0004 (cả hai đang trực).
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

create function pg_temp.inbound(mid text, psid text, body text default 'Cho em hỏi giá ghế') returns text
language sql as $$
  select public.ingest_channel_message(jsonb_build_object(
    'showroom_id', '4a000000-0000-4000-8000-000000000004', 'channel', 'messenger', 'page_id', '111',
    'external_user_id', psid, 'identity_type', 'fb_psid', 'consent_channel', 'messenger',
    'lead_source', 'meta_messenger', 'source_key', 'fb_messenger', 'label', 'Messenger', 'mid', mid,
    'text', body, 'display_name', 'Khách ' || psid));
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;

insert into public.integrations (showroom_id, key, status, enabled, reply_mode, config)
values ('4a000000-0000-4000-8000-000000000004', 'meta_messenger', 'connected', true, 'crm', '{"pageId":"111"}')
on conflict (showroom_id, key) do update set status = 'connected', enabled = true, reply_mode = 'crm';
insert into public.integrations (showroom_id, key, status, enabled, config)
values ('4a000000-0000-4000-8000-000000000004', 'ai_llm', 'connected', true,
        '{"model":"claude-sonnet-5-5","autoReply":["messenger"],"monthlyBudget":"100000","usdRate":"26500"}')
on conflict (showroom_id, key) do update set status = 'connected', enabled = true, config = excluded.config;

-- Khách lạ nhắn: AI phụ trách, không báo nhân viên từng tin.
select pg_temp.inbound('ai.1', '9901');
insert into t select 'conv', id::text from public.conversations where external_user_id = '9901';
insert into t select 'holder', assigned_to::text from public.conversations where external_user_id = '9901';
select ok((select ai_paused_at is null and public.ai_handles(c) from public.conversations c where external_user_id = '9901'),
  'hội thoại mới: AI phụ trách');
select is((select count(*)::int from public.notifications where type = 'message_in'
           and link = '/inbox?c=' || (select v from t where k = 'conv')), 0,
  'AI đang trả lời thì không báo nhân viên từng tin');
select is(public.ai_reply_channels_for('4a000000-0000-4000-8000-000000000004'), array['messenger'],
  'kênh AI tự trả lời đọc từ cấu hình');

-- Một lượt cho một tin.
insert into t select 'run', public.start_ai_run((select v::uuid from t where k = 'conv')) ->> 'run_id';
select ok((select v from t where k = 'run') is not null, 'mở lượt AI cho tin mới của khách');
select is(public.start_ai_run((select v::uuid from t where k = 'conv')) ->> 'skip', 'duplicate',
  'tin đã có lượt thì không mở lượt thứ hai');

-- Tin AI: ghi chờ gửi, không làm AI dừng, gửi xong ghi sự kiện của AI.
insert into t select 'aimsg', public.queue_ai_reply((select v::uuid from t where k = 'run'),
  'Dạ em là trợ lý tự động của Showroom Đại Việt Q4 ạ') ->> 'message_id';
select ok((select ai_run_id::text = (select v from t where k = 'run') and sent_by is null and status = 'queued'
           from public.messages where id = (select v::uuid from t where k = 'aimsg')),
  'tin AI ghi chờ gửi, gắn lượt AI');
select ok((select ai_paused_at is null from public.conversations where id = (select v::uuid from t where k = 'conv')),
  'tin AI không làm AI dừng');
select public.finish_channel_reply((select v::uuid from t where k = 'aimsg'), 'm_ai_1');
select is((select actor_type from public.events where type = 'messenger_out'
           and payload ->> 'message_id' = (select v from t where k = 'aimsg')), 'ai',
  'sự kiện gửi tin ghi người làm là AI');
select public.finish_ai_run((select v::uuid from t where k = 'run'), 'replied', 'reply', 'Khách hỏi giá ghế',
  '{"input_tokens":1200,"output_tokens":80,"cost_usd_micros":3200,"cost_vnd":85}');
select ok((select status = 'replied' and cost_vnd = 85 and input_tokens = 1200 from public.ai_runs
           where id = (select v::uuid from t where k = 'run')), 'đóng lượt ghi token, chi phí');
select is(public.start_ai_run((select v::uuid from t where k = 'conv')) ->> 'skip', 'answered',
  'tin cuối là tin AI thì không mở lượt');

-- Khách để số, cần gọi: AI chuyển người, tự thành lead, tin AI không tính là đã liên hệ.
select pg_temp.inbound('ai.2', '9901', 'Gọi cho chị nhé');
insert into t select 'run2', public.start_ai_run((select v::uuid from t where k = 'conv')) ->> 'run_id';
select public.queue_ai_reply((select v::uuid from t where k = 'run2'), 'Dạ nhân viên sẽ gọi chị ngay ạ');
insert into t select 'lead', public.ai_handoff((select v::uuid from t where k = 'run2'), 'call_request',
  'Khách muốn được gọi tư vấn ghế', true)::text;
select ok((select stage = 'new' and first_contact_at is null and sla_due_at is not null
                  and assigned_to::text = (select v from t where k = 'holder')
           from public.leads where id = (select v::uuid from t where k = 'lead')),
  'khách cần gọi: tự thành lead, giao người đang phụ trách, tính SLA');
select ok((select ai_paused_at is not null and ai_pause_reason = 'handoff' and lead_id::text = (select v from t where k = 'lead')
           from public.conversations where id = (select v::uuid from t where k = 'conv')),
  'AI dừng ở hội thoại, hội thoại gắn lead');
select ok(exists (select 1 from public.notifications where type = 'ai_handoff'
                  and user_id = (select v::uuid from t where k = 'holder')), 'báo người phụ trách khi AI chuyển');
select ok(exists (select 1 from public.events where type = 'ai_handoff' and actor_type = 'ai'
                  and lead_id = (select v::uuid from t where k = 'lead')), 'ghi sự kiện AI chuyển');
select ok(exists (select 1 from public.audit_logs where action = 'lead.qualify' and actor_type = 'ai'
                  and entity_id = (select v from t where k = 'lead')), 'nhật ký kiểm toán ghi AI tạo lead');
select ok((select status = 'handed_off' and handoff_reason = 'call_request' from public.ai_runs
           where id = (select v::uuid from t where k = 'run2')), 'lượt AI ghi lý do chuyển');
select is(public.start_ai_run((select v::uuid from t where k = 'conv')) ->> 'skip', 'paused',
  'AI đã dừng thì không mở lượt mới');

-- Người được giao thấy lượt AI của hội thoại; telesale khác thì không. Trả lại AI, Tiếp quản theo quyền.
select pg_temp.login((select v::uuid from t where k = 'holder'));
select is((select count(*)::int from public.ai_runs where conversation_id = (select v::uuid from t where k = 'conv')), 2,
  'người giữ lead thấy lượt AI của hội thoại');
select lives_ok(format($$ select public.ai_release(%L) $$, (select v from t where k = 'conv')),
  'người giữ lead Trả lại AI');
select ok((select ai_paused_at is null from public.conversations where id = (select v::uuid from t where k = 'conv')),
  'Trả lại AI: AI phụ trách lại');
select lives_ok(format($$ select public.ai_takeover(%L) $$, (select v from t where k = 'conv')),
  'người giữ lead Tiếp quản');
select ok((select ai_pause_reason = 'takeover' from public.conversations where id = (select v::uuid from t where k = 'conv')),
  'Tiếp quản: AI dừng, ghi lý do');
select pg_temp.login(case when (select v from t where k = 'holder') = '11111111-1111-4111-8111-000000000003'
                          then '11111111-1111-4111-8111-000000000004'::uuid
                          else '11111111-1111-4111-8111-000000000003'::uuid end);
select is((select count(*)::int from public.ai_runs where conversation_id = (select v::uuid from t where k = 'conv')), 0,
  'telesale khác không thấy lượt AI');
select throws_ok(format($$ select public.ai_release(%L) $$, (select v from t where k = 'conv')),
  'P0002', null, 'telesale khác không Trả lại AI được');

-- Nhân viên tự gửi tin từ CRM thì AI dừng ở hội thoại đó.
select pg_temp.logout();
select pg_temp.inbound('ai.3', '9902');
insert into t select 'conv2', id::text from public.conversations where external_user_id = '9902';
select pg_temp.login((select assigned_to from public.conversations where external_user_id = '9902'));
select public.queue_messenger_reply((select v::uuid from t where k = 'conv2'), 'Dạ em chào chị');
select pg_temp.logout();
select ok((select ai_pause_reason = 'staff_reply' from public.conversations where id = (select v::uuid from t where k = 'conv2')),
  'nhân viên gửi tin từ CRM: AI dừng');

-- Nhân viên trả lời thẳng trên Page (bản sao không phải của CRM): AI cũng dừng.
select pg_temp.inbound('ai.4', '9903');
select public.ingest_channel_message(jsonb_build_object(
  'showroom_id', '4a000000-0000-4000-8000-000000000004', 'channel', 'messenger', 'page_id', '111',
  'external_user_id', '9903', 'identity_type', 'fb_psid', 'consent_channel', 'messenger',
  'lead_source', 'meta_messenger', 'source_key', 'fb_messenger', 'label', 'Messenger', 'mid', 'ai.4.echo',
  'text', 'Dạ chị chờ em chút', 'echo', true));
select ok((select ai_pause_reason = 'staff_reply' from public.conversations where external_user_id = '9903'),
  'nhân viên trả lời trên Page: AI dừng');

-- Hết ngân sách tháng: vẫn mở lượt, kèm cờ để server chuyển người.
select pg_temp.inbound('ai.5', '9904');
update public.ai_runs set cost_vnd = 200000 where id = (select v::uuid from t where k = 'run');
select ok((public.start_ai_run((select id from public.conversations where external_user_id = '9904')) ->> 'budget_exceeded')::boolean,
  'chạm giới hạn chi phí tháng thì đánh dấu hết ngân sách');

-- Tắt AI cho kênh: hội thoại không còn do AI phụ trách, Trả lại AI bị từ chối.
update public.integrations set config = config || '{"autoReply":[]}' where key = 'ai_llm';
select pg_temp.inbound('ai.6', '9905');
select is(public.start_ai_run((select id from public.conversations where external_user_id = '9905')) ->> 'skip', 'disabled',
  'tắt AI cho kênh thì không mở lượt');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select throws_ok(format($$ select public.ai_release(%L) $$, (select v from t where k = 'conv2')),
  'P0001', 'ai_off', 'kênh tắt AI thì không Trả lại AI được');

-- Kiến thức cho AI: chỉ người có quyền Cài đặt, Tích hợp.
select pg_temp.login('11111111-1111-4111-8111-000000000001');
select lives_ok($$ insert into public.ai_knowledge (showroom_id, title, body)
                   values ('4a000000-0000-4000-8000-000000000004', 'Giờ mở cửa', '8:30 tới 21:00 mỗi ngày') $$,
  'Owner thêm kiến thức cho AI');
select pg_temp.login('11111111-1111-4111-8111-000000000003');
select is((select count(*)::int from public.ai_knowledge), 0, 'telesale không đọc được kiến thức cho AI');

select * from finish();
rollback;
