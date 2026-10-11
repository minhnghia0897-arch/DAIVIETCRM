-- Cột phải màn Hội thoại chạy thật (11/10/2026, lát 1 của "lên đơn kiểu Pancake", open question 32):
-- sửa tên khách, lưu số điện thoại khách nhắn trong hội thoại, địa chỉ giao để dùng lại khi lên đơn, ghi chú ghim lên
-- đầu hội thoại cho cả đội. Mọi lệnh ghi đi qua hàm dưới đây: kiểm quyền sửa khách, chặn "Xem như", ghi nhật ký và
-- dòng sự kiện (không chứa số điện thoại đầy đủ).

-- Người sửa được hồ sơ khách: xem được khách và có lead.edit_all, hoặc lead.edit_own khi đang giữ một lead của khách
-- (người đặt hoặc người nhận). Trả về showroom của khách.
create or replace function public.assert_contact_editor(p_contact_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_showroom uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select showroom_id into v_showroom from public.contacts
  where id = p_contact_id and deleted_at is null and showroom_id = public.current_showroom_id();
  if v_showroom is null or not public.can_view_contact(p_contact_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if not coalesce(
    public.has_perm('lead.edit_all')
    or (public.has_perm('lead.edit_own') and exists (
      select 1 from public.leads l
      where l.deleted_at is null and l.assigned_to = v_user
        and (l.contact_id = p_contact_id or l.recipient_contact_id = p_contact_id)
    )),
    false
  ) then
    raise exception 'not allowed to edit this contact' using errcode = '42501';
  end if;
  return v_showroom;
end;
$$;

revoke all on function public.assert_contact_editor(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sửa tên khách (khách Messenger, Zalo thường chỉ có tên tạm "Khách Messenger 1234")
-- ---------------------------------------------------------------------------

create or replace function public.rename_contact(p_contact_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_contact_editor(p_contact_id);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  update public.contacts set full_name = v_name where id = p_contact_id;
  perform public.record_event('contact_renamed', v_showroom, p_contact_id, null, '{}'::jsonb, 'user');
  perform public.write_audit('contact.rename', 'contacts', p_contact_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.rename_contact(uuid, text) from public, anon;
grant execute on function public.rename_contact(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lưu số điện thoại khách nhắn trong hội thoại. Server ứng dụng chuẩn hóa số (lib/phone) và tính bản che; database
-- kiểm định dạng, chống trùng theo định danh (CLAUDE.md mục 6, Chống trùng), ghi căn cứ đồng ý chăm sóc qua gọi.
-- Trả về 'added' | 'exists'; số đang thuộc khách khác thì báo lỗi 'phone_taken' (cần gộp hồ sơ, contact.merge).
-- ---------------------------------------------------------------------------

create or replace function public.add_contact_phone(
  p_contact_id uuid,
  p_e164 text,
  p_raw text,
  p_masked text,
  p_source text default 'chat'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_contact_editor(p_contact_id);
  v_owner uuid;
  v_id uuid;
begin
  if p_e164 !~ '^\+[1-9][0-9]{6,14}$' or coalesce(p_masked, '') = '' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  select contact_id into v_owner from public.contact_identities
  where showroom_id = v_showroom and type = 'phone' and value = p_e164;
  if v_owner = p_contact_id then
    return 'exists';
  elsif v_owner is not null then
    raise exception 'phone_taken' using errcode = 'P0001';
  end if;

  insert into public.contact_identities (showroom_id, contact_id, type, value, value_raw, display_masked, is_primary,
                                         source, created_by)
  values (v_showroom, p_contact_id, 'phone', p_e164, left(p_raw, 40), left(p_masked, 40),
          not exists (select 1 from public.contact_identities
                      where contact_id = p_contact_id and type = 'phone'),
          p_source, auth.uid())
  returning id into v_id;

  -- Khách tự nhắn số cho showroom: căn cứ chăm sóc qua gọi (không phải đồng ý marketing).
  insert into public.consents (showroom_id, contact_id, purpose, channel, granted, source, created_by)
  values (v_showroom, p_contact_id, 'care', 'call', true, 'Khách tự nhắn số trong hội thoại', auth.uid());

  perform public.record_event('identity_added', v_showroom, p_contact_id, null,
    jsonb_build_object('type', 'phone', 'source', p_source), 'user');
  perform public.write_audit('contact.add_phone', 'contact_identities', v_id::text,
    jsonb_build_object('contact_id', p_contact_id, 'source', p_source));
  return 'added';
end;
$$;

revoke all on function public.add_contact_phone(uuid, text, text, text, text) from public, anon;
grant execute on function public.add_contact_phone(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Địa chỉ giao của khách (dùng lại khi lên đơn quà, người nhận ở tỉnh khác)
-- ---------------------------------------------------------------------------

create table public.contact_addresses (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  -- Người nhận tại địa chỉ này nếu khác chính khách (ví dụ "Mẹ", "Anh Hùng").
  receiver text check (receiver is null or length(receiver) <= 120),
  street text check (street is null or length(street) <= 200),
  ward text check (ward is null or length(ward) <= 80),
  district text check (district is null or length(district) <= 80),
  province text not null check (length(btrim(province)) between 1 and 80),
  note text check (note is null or length(note) <= 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

create index contact_addresses_contact_idx on public.contact_addresses (contact_id) where deleted_at is null;

create trigger contact_addresses_updated_at before update on public.contact_addresses
  for each row execute function public.set_updated_at();

alter table public.contact_addresses enable row level security;

create policy contact_addresses_select on public.contact_addresses for select to authenticated
  using (deleted_at is null and public.can_view_contact(contact_id));

revoke insert, update, delete on public.contact_addresses from authenticated, anon;

-- p: { id?, contact_id, receiver?, street?, ward?, district?, province, note?, is_default? }. Trả về id.
create or replace function public.save_contact_address(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid := (p ->> 'contact_id')::uuid;
  v_showroom uuid := public.assert_contact_editor(v_contact);
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_default boolean := coalesce((p ->> 'is_default')::boolean, false);
  v_province text := nullif(btrim(coalesce(p ->> 'province', '')), '');
begin
  if v_province is null then
    raise exception 'province required' using errcode = '22023';
  end if;
  -- Địa chỉ đầu tiên của khách là địa chỉ mặc định.
  if not exists (select 1 from public.contact_addresses
                 where contact_id = v_contact and deleted_at is null and id is distinct from v_id) then
    v_default := true;
  end if;
  if v_default then
    update public.contact_addresses set is_default = false
    where contact_id = v_contact and deleted_at is null and is_default and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.contact_addresses (showroom_id, contact_id, receiver, street, ward, district, province, note,
                                          is_default, created_by)
    values (v_showroom, v_contact, nullif(btrim(p ->> 'receiver'), ''), nullif(btrim(p ->> 'street'), ''),
            nullif(btrim(p ->> 'ward'), ''), nullif(btrim(p ->> 'district'), ''), v_province,
            nullif(btrim(p ->> 'note'), ''), v_default, auth.uid())
    returning id into v_id;
  else
    update public.contact_addresses
      set receiver = nullif(btrim(p ->> 'receiver'), ''), street = nullif(btrim(p ->> 'street'), ''),
          ward = nullif(btrim(p ->> 'ward'), ''), district = nullif(btrim(p ->> 'district'), ''),
          province = v_province, note = nullif(btrim(p ->> 'note'), ''), is_default = v_default
      where id = v_id and contact_id = v_contact and deleted_at is null;
    if not found then
      raise exception 'address not found' using errcode = 'P0002';
    end if;
  end if;
  perform public.record_event('address_saved', v_showroom, v_contact, null,
    jsonb_build_object('province', v_province), 'user');
  return v_id;
end;
$$;

revoke all on function public.save_contact_address(jsonb) from public, anon;
grant execute on function public.save_contact_address(jsonb) to authenticated;

create or replace function public.delete_contact_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
begin
  select contact_id into v_contact from public.contact_addresses where id = p_id and deleted_at is null;
  if v_contact is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  perform public.assert_contact_editor(v_contact);
  update public.contact_addresses set deleted_at = now(), is_default = false where id = p_id;
end;
$$;

revoke all on function public.delete_contact_address(uuid) from public, anon;
grant execute on function public.delete_contact_address(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ghi chú về khách, ghim được lên đầu hội thoại cho mọi người trả lời khách đó. Ghi chú thường cũng vào dòng sự
-- kiện của khách (và của lead đang mở) để hiện trên dòng hoạt động; bảng riêng vì sự kiện không sửa được nên không
-- bỏ ghim được.
-- ---------------------------------------------------------------------------

create table public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

create index contact_notes_contact_idx on public.contact_notes (contact_id, pinned desc, created_at desc)
  where deleted_at is null;

create trigger contact_notes_updated_at before update on public.contact_notes
  for each row execute function public.set_updated_at();

alter table public.contact_notes enable row level security;

create policy contact_notes_select on public.contact_notes for select to authenticated
  using (deleted_at is null and public.can_view_contact(contact_id));

revoke insert, update, delete on public.contact_notes from authenticated, anon;

-- Ai xem được khách thì ghi chú được (giống ghi chú trên lead); văn bản đã che số điện thoại ở server ứng dụng.
create or replace function public.add_contact_note(p_contact_id uuid, p_text text, p_pinned boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid;
  v_id uuid;
  v_lead uuid;
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
  if length(btrim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception 'invalid note' using errcode = '22023';
  end if;
  select showroom_id into v_showroom from public.contacts where id = p_contact_id;
  insert into public.contact_notes (showroom_id, contact_id, text, pinned, created_by)
  values (v_showroom, p_contact_id, btrim(p_text), coalesce(p_pinned, false), auth.uid())
  returning id into v_id;

  select id into v_lead from public.leads
  where contact_id = p_contact_id and deleted_at is null and stage not in ('won', 'lost')
  order by created_at desc limit 1;
  perform public.record_event('note', v_showroom, p_contact_id, v_lead,
    jsonb_build_object('text', left(btrim(p_text), 2000), 'channel', 'inbox', 'pinned', coalesce(p_pinned, false)),
    'user');
  return v_id;
end;
$$;

revoke all on function public.add_contact_note(uuid, text, boolean) from public, anon;
grant execute on function public.add_contact_note(uuid, text, boolean) to authenticated;

create or replace function public.set_contact_note_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
begin
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select contact_id into v_contact from public.contact_notes where id = p_id and deleted_at is null;
  if v_contact is null or not public.can_view_contact(v_contact) then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  update public.contact_notes set pinned = coalesce(p_pinned, false) where id = p_id;
end;
$$;

revoke all on function public.set_contact_note_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_contact_note_pinned(uuid, boolean) to authenticated;

-- Xóa (mềm) ghi chú: người viết, hoặc người sửa được khách.
create or replace function public.delete_contact_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.contact_notes;
begin
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  select * into v_note from public.contact_notes where id = p_id and deleted_at is null;
  if not found or not public.can_view_contact(v_note.contact_id) then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if v_note.created_by is distinct from auth.uid() then
    perform public.assert_contact_editor(v_note.contact_id);
  end if;
  update public.contact_notes set deleted_at = now(), pinned = false where id = p_id;
end;
$$;

revoke all on function public.delete_contact_note(uuid) from public, anon;
grant execute on function public.delete_contact_note(uuid) to authenticated;
