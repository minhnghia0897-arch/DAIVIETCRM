-- Hội thoại đầy đủ như bản demo (11/10/2026, open question 33): thẻ khách và trạng thái "đã xong" của hội thoại.
-- Người phụ trách hội thoại là người giữ lead gắn với hội thoại (giao bằng assign_leads, cần lead.assign), nên không
-- thêm cột riêng.
--
-- Thẻ gắn vào KHÁCH chứ không vào từng hội thoại, để thẻ đi theo khách qua mọi kênh. Ai làm việc với khách (xem được
-- khách) thì gắn, gỡ và tạo thẻ mới; xóa thẻ khỏi danh mục cần catalog.manage.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  label text not null check (length(btrim(label)) between 1 and 30),
  color text not null default '#8e99a4' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

create unique index tags_label_idx on public.tags (showroom_id, lower(btrim(label))) where deleted_at is null;

create trigger tags_updated_at before update on public.tags
  for each row execute function public.set_updated_at();

alter table public.tags enable row level security;

create policy tags_select on public.tags for select to authenticated
  using (showroom_id = public.current_showroom_id() and deleted_at is null);

revoke insert, update, delete on public.tags from authenticated, anon;

create table public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  showroom_id uuid not null references public.showrooms (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (contact_id, tag_id)
);

create index contact_tags_tag_idx on public.contact_tags (tag_id);

alter table public.contact_tags enable row level security;

create policy contact_tags_select on public.contact_tags for select to authenticated
  using (public.can_view_contact(contact_id));

revoke insert, update, delete on public.contact_tags from authenticated, anon;

-- Bộ thẻ gợi ý ban đầu (sửa, xóa được trong danh mục); thêm cho mọi showroom đang có.
insert into public.tags (showroom_id, label, color, sort)
select s.id, t.label, t.color, t.sort
from public.showrooms s
cross join (values
  ('Khách Hàn', '#1264a3', 1),
  ('Quan tâm ghế', '#7c3aed', 2),
  ('Quan tâm máy lọc', '#0f766e', 3),
  ('Hỏi giá', '#c2410c', 4),
  ('Lo ngại uy tín', '#b91c1c', 5),
  ('Khách cũ', '#6b4f3a', 6),
  ('Đã chốt', '#15803d', 7)
) as t(label, color, sort)
on conflict do nothing;

-- Gắn hoặc gỡ một thẻ cho khách; trả về true khi thẻ đang gắn sau lệnh.
create or replace function public.toggle_contact_tag(p_contact_id uuid, p_tag_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.current_showroom_id();
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.can_view_contact(p_contact_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tags where id = p_tag_id and showroom_id = v_showroom and deleted_at is null) then
    raise exception 'tag not found' using errcode = 'P0002';
  end if;
  delete from public.contact_tags where contact_id = p_contact_id and tag_id = p_tag_id;
  if found then
    return false;
  end if;
  insert into public.contact_tags (contact_id, tag_id, showroom_id, created_by)
  values (p_contact_id, p_tag_id, v_showroom, auth.uid());
  return true;
end;
$$;

revoke all on function public.toggle_contact_tag(uuid, uuid) from public, anon;
grant execute on function public.toggle_contact_tag(uuid, uuid) to authenticated;

-- Tạo thẻ mới (hoặc dùng lại thẻ cùng tên) rồi gắn cho khách. Trả về id thẻ.
create or replace function public.create_contact_tag(p_contact_id uuid, p_label text, p_color text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.current_showroom_id();
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.can_view_contact(p_contact_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if length(v_label) not between 1 and 30 then
    raise exception 'invalid tag' using errcode = '22023';
  end if;
  select id into v_id from public.tags
  where showroom_id = v_showroom and deleted_at is null and lower(btrim(label)) = lower(v_label);
  if v_id is null then
    insert into public.tags (showroom_id, label, color, sort, created_by)
    values (v_showroom, v_label, coalesce(nullif(p_color, ''), '#8e99a4'),
            coalesce((select max(sort) from public.tags where showroom_id = v_showroom), 0) + 1, auth.uid())
    returning id into v_id;
    perform public.write_audit('tag.create', 'tags', v_id::text, jsonb_build_object('label', v_label));
  end if;
  insert into public.contact_tags (contact_id, tag_id, showroom_id, created_by)
  values (p_contact_id, v_id, v_showroom, auth.uid())
  on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function public.create_contact_tag(uuid, text, text) from public, anon;
grant execute on function public.create_contact_tag(uuid, text, text) to authenticated;

create or replace function public.delete_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_perm('catalog.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.tags set deleted_at = now()
  where id = p_tag_id and showroom_id = public.current_showroom_id() and deleted_at is null;
  if not found then
    raise exception 'tag not found' using errcode = 'P0002';
  end if;
  delete from public.contact_tags where tag_id = p_tag_id;
  perform public.write_audit('tag.delete', 'tags', p_tag_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.delete_tag(uuid) from public, anon;
grant execute on function public.delete_tag(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trạng thái hội thoại: mở hoặc đã xong. Khách nhắn tin mới thì tự mở lại.
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column status text not null default 'open' check (status in ('open', 'done')),
  add column done_at timestamptz,
  add column done_by uuid;

create or replace function public.set_conversation_done(p_conversation_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or not public.can_see_conversation(v_conv) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  update public.conversations
    set status = case when p_done then 'done' else 'open' end,
        done_at = case when p_done then now() end,
        done_by = case when p_done then auth.uid() end
    where id = p_conversation_id;
end;
$$;

revoke all on function public.set_conversation_done(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_done(uuid, boolean) to authenticated;

create or replace function public.reopen_conversation_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'in' then
    update public.conversations set status = 'open', done_at = null, done_by = null
    where id = new.conversation_id and status = 'done';
  end if;
  return new;
end;
$$;

revoke all on function public.reopen_conversation_on_inbound() from public, anon, authenticated;

create trigger messages_reopen_conversation after insert on public.messages
  for each row execute function public.reopen_conversation_on_inbound();
