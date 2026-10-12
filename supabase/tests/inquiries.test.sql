-- Kiểm thử khách đang hỏi (supabase/migrations/20261012000200_inquiries.sql): tin nhắn của người lạ không tự thành lead,
-- hội thoại chia cho telesale đang trực, người được giao xem và sửa được khách, chỉ lead.assign giao lại và chuyển
-- thành lead, lead chuyển người khác thì người cũ mất quyền xem, khóa người dùng thì trả hội thoại.
-- Dữ liệu giả: Owner …0001, sale admin …0002, telesale Thảo …0003, An …0004 (cả hai đang trực).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

create function pg_temp.inbound(mid text, psid text) returns text language sql as $$
  select public.ingest_channel_message(jsonb_build_object(
    'showroom_id', '4a000000-0000-4000-8000-000000000004', 'channel', 'messenger', 'page_id', '111',
    'external_user_id', psid, 'identity_type', 'fb_psid', 'consent_channel', 'messenger',
    'lead_source', 'meta_messenger', 'source_key', 'fb_messenger', 'label', 'Messenger', 'mid', mid,
    'text', 'Cho em hỏi giá', 'display_name', 'Khách ' || psid));
$$;

create temp table t (k text primary key, v text);
grant all on t to authenticated;

select pg_temp.inbound('q.1', '8801');
insert into t select 'conv', id::text from public.conversations where external_user_id = '8801';
insert into t select 'contact', contact_id::text from public.conversations where external_user_id = '8801';
insert into t select 'holder', assigned_to::text from public.conversations where external_user_id = '8801';
insert into t select 'other', case when (select v from t where k = 'holder') = '11111111-1111-4111-8111-000000000003'
                                  then '11111111-1111-4111-8111-000000000004'
                                  else '11111111-1111-4111-8111-000000000003' end;

-- Người được giao làm việc với khách đang hỏi; telesale khác thì không.
select pg_temp.login((select v::uuid from t where k = 'holder'));
select is((select count(*)::int from public.conversations where external_user_id = '8801'), 1,
  'người được giao thấy hội thoại');
select is((select count(*)::int from public.contacts where id = (select v::uuid from t where k = 'contact')), 1,
  'người được giao thấy hồ sơ khách');
select lives_ok(format($$ select public.rename_contact(%L, 'Chị Hoa Nghệ An') $$, (select v from t where k = 'contact')),
  'người được giao sửa được tên khách');
select throws_ok(format($$ select public.assign_conversation(%L, %L) $$, (select v from t where k = 'conv'),
                        (select v from t where k = 'other')),
  '42501', null, 'telesale không tự giao hội thoại cho người khác');
select pg_temp.login((select v::uuid from t where k = 'other'));
select is((select count(*)::int from public.conversations where external_user_id = '8801'), 0,
  'telesale khác không thấy hội thoại');
select is((select count(*)::int from public.contacts where id = (select v::uuid from t where k = 'contact')), 0,
  'telesale khác không thấy khách');

-- Sale admin giao lại hội thoại.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select public.assign_conversation((select v::uuid from t where k = 'conv'), (select v::uuid from t where k = 'other'));
select is((select assigned_to::text from public.conversations where external_user_id = '8801'),
  (select v from t where k = 'other'), 'Sale admin giao lại hội thoại');
select pg_temp.logout();
select ok(exists (select 1 from public.notifications where type = 'conversation_assigned'
                  and user_id = (select v::uuid from t where k = 'other')), 'báo người được giao');
select pg_temp.login((select v::uuid from t where k = 'holder'));
select is((select count(*)::int from public.conversations where external_user_id = '8801'), 0,
  'người cũ mất quyền xem ngay khi hội thoại giao người khác');

-- Chuyển thành lead, rồi chuyển lead đi: người giữ cũ mất quyền xem hội thoại.
select pg_temp.login('11111111-1111-4111-8111-000000000002');
insert into t select 'lead', public.qualify_conversation((select v::uuid from t where k = 'conv'))::text;
select ok((select assigned_to::text = (select v from t where k = 'other') and stage = 'new' and sla_due_at is not null
           from public.leads where id = (select v::uuid from t where k = 'lead')),
  'chưa ai trả lời: lead mới, tính SLA, giao người đang phụ trách');
select pg_temp.logout();
select ok(exists (select 1 from public.events where type = 'lead_qualified'
                  and lead_id = (select v::uuid from t where k = 'lead')), 'ghi sự kiện chuyển thành lead');
select ok(exists (select 1 from public.audit_logs where action = 'lead.qualify'
                  and entity_id = (select v from t where k = 'lead')), 'ghi nhật ký kiểm toán');
select pg_temp.login('11111111-1111-4111-8111-000000000002');
select public.assign_leads(array[(select v::uuid from t where k = 'lead')], (select v::uuid from t where k = 'holder'));
select throws_ok(format($$ select public.assign_conversation(%L, null) $$, (select v from t where k = 'conv')),
  '22023', null, 'hội thoại đã có lead thì giao lead, không giao hội thoại');
select pg_temp.login((select v::uuid from t where k = 'other'));
select is((select count(*)::int from public.conversations where external_user_id = '8801'), 0,
  'lead chuyển người khác: người được giao hội thoại trước đó mất quyền xem');
select pg_temp.login((select v::uuid from t where k = 'holder'));
select is((select count(*)::int from public.conversations where external_user_id = '8801'), 1,
  'người giữ lead mới thấy hội thoại');

-- Không ai trực: hội thoại chưa giao, người xem mọi hội thoại được báo; có người bật Trực thì chia.
select pg_temp.logout();
update public.duty_sessions set ended_at = now(), end_source = 'manager' where ended_at is null;
select pg_temp.inbound('q.2', '8802');
select ok((select assigned_to is null from public.conversations where external_user_id = '8802')
          and exists (select 1 from public.notifications where type = 'message_in'
                      and user_id = '11111111-1111-4111-8111-000000000002'
                      and link = '/inbox?c=' || (select id from public.conversations where external_user_id = '8802')),
  'không ai trực: chưa giao, báo Sale admin');
insert into public.duty_sessions (showroom_id, user_id, started_at)
values ('4a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000003', now());
select public.route_no_receiver_leads('4a000000-0000-4000-8000-000000000004');
select is((select assigned_to::text from public.conversations where external_user_id = '8802'),
  '11111111-1111-4111-8111-000000000003', 'có người bật Trực thì hội thoại được chia');

-- Khóa người dùng: hội thoại chưa có lead của họ về "Chưa giao".
update public.profiles set is_active = false where id = '11111111-1111-4111-8111-000000000003';
select ok((select assigned_to is null from public.conversations where external_user_id = '8802'),
  'khóa người dùng thì trả hội thoại chưa có lead');

select * from finish();
rollback;
