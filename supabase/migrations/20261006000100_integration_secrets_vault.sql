-- Lưu khóa đấu nối vào Supabase Vault (CLAUDE.md 10.1 quy tắc 5, 10.2; docs/open-questions.md mục 17, đã duyệt 06/10/2026).
-- Nguyên tắc:
--   * Giá trị khóa chỉ nằm trong vault.secrets (mã hóa). Bảng public chỉ ghi tên khóa, ngày cập nhật, người cập nhật.
--   * Người dùng không đọc được giá trị khóa bằng bất kỳ đường nào; chỉ service_role (Edge Function, route handler
--     phía server gọi nhà cung cấp) đọc qua get_integration_secret().
--   * Ghi, thay, xóa khóa chỉ qua hàm security definer, kiểm quyền settings.integrations của người đăng nhập thật,
--     chặn khi đang "Xem như", ghi audit_logs không kèm giá trị.

create table public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  integration_key text not null,
  name text not null check (name ~ '^[a-z0-9_]{2,64}$'),
  vault_secret_id uuid not null,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (showroom_id, integration_key, name)
);

create trigger integration_secrets_updated_at before update on public.integration_secrets
  for each row execute function public.set_updated_at();

alter table public.integration_secrets enable row level security;

-- Chỉ đọc siêu dữ liệu (tên khóa, ngày cập nhật); không có policy ghi: mọi thay đổi đi qua hàm bên dưới.
create policy integration_secrets_select on public.integration_secrets for select to authenticated
  using (showroom_id = public.current_showroom_id() and public.has_perm('settings.integrations'));

revoke insert, update, delete on public.integration_secrets from authenticated, anon;

-- Khóa đấu nối hợp lệ: chữ thường, số, gạch dưới (khớp `key` trong lib/integrations/registry.ts).
create or replace function public.assert_integration_writer(p_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.current_showroom_id();
begin
  if auth.uid() is null or v_showroom is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (public.active_view_as()).id is not null then
    raise exception 'view-as session is read-only' using errcode = '42501';
  end if;
  if not public.has_real_perm('settings.integrations') then
    raise exception 'missing permission settings.integrations' using errcode = '42501';
  end if;
  if p_key !~ '^[a-z0-9_]{2,64}$' then
    raise exception 'invalid integration key' using errcode = '22023';
  end if;
  return v_showroom;
end;
$$;

-- Ghi hoặc thay một khóa. Trả về thời điểm cập nhật; không bao giờ trả lại giá trị.
create or replace function public.set_integration_secret(p_key text, p_name text, p_value text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_integration_writer(p_key);
  v_row public.integration_secrets;
  v_vault_name text;
  v_secret_id uuid;
  v_replaced boolean := false;
begin
  if p_name !~ '^[a-z0-9_]{2,64}$' then
    raise exception 'invalid secret name' using errcode = '22023';
  end if;
  if p_value is null or length(btrim(p_value)) = 0 or length(p_value) > 8192 then
    raise exception 'invalid secret value' using errcode = '22023';
  end if;

  -- Dòng đấu nối của showroom (tạo khi chưa có).
  insert into public.integrations (showroom_id, key)
  values (v_showroom, p_key)
  on conflict (showroom_id, key) do nothing;

  select * into v_row from public.integration_secrets
  where showroom_id = v_showroom and integration_key = p_key and name = p_name
  for update;

  v_vault_name := format('integration/%s/%s/%s', v_showroom, p_key, p_name);
  if found then
    perform vault.update_secret(v_row.vault_secret_id, btrim(p_value), v_vault_name);
    update public.integration_secrets set updated_by = auth.uid(), updated_at = now() where id = v_row.id
      returning * into v_row;
    v_replaced := true;
  else
    v_secret_id := vault.create_secret(btrim(p_value), v_vault_name, 'Khóa đấu nối CRM');
    insert into public.integration_secrets (showroom_id, integration_key, name, vault_secret_id, updated_by)
    values (v_showroom, p_key, p_name, v_secret_id, auth.uid())
    returning * into v_row;
  end if;

  update public.integrations
  set secret_ref = format('vault:integration/%s/%s', v_showroom, p_key)
  where showroom_id = v_showroom and key = p_key;

  perform public.write_audit(
    case when v_replaced then 'integration.secret_replace' else 'integration.secret_set' end,
    'integrations',
    p_key,
    jsonb_build_object('integration', p_key, 'secret', p_name)
  );
  return v_row.updated_at;
end;
$$;

-- Xóa một khóa (ngắt kết nối hoặc thu hồi token đăng nhập).
create or replace function public.delete_integration_secret(p_key text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_showroom uuid := public.assert_integration_writer(p_key);
  v_row public.integration_secrets;
begin
  delete from public.integration_secrets
  where showroom_id = v_showroom and integration_key = p_key and name = p_name
  returning * into v_row;
  if not found then
    return false;
  end if;
  delete from vault.secrets where id = v_row.vault_secret_id;
  perform public.write_audit(
    'integration.secret_delete',
    'integrations',
    p_key,
    jsonb_build_object('integration', p_key, 'secret', p_name)
  );
  return true;
end;
$$;

-- Đọc giá trị khóa: chỉ service_role (adapter chạy ở server); người dùng không gọi được.
create or replace function public.get_integration_secret(p_showroom uuid, p_key text, p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.integration_secrets s
  join vault.decrypted_secrets d on d.id = s.vault_secret_id
  where s.showroom_id = p_showroom and s.integration_key = p_key and s.name = p_name;
$$;

revoke all on function public.get_integration_secret(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_integration_secret(uuid, text, text) to service_role;

revoke all on function public.assert_integration_writer(text) from public, anon;
revoke all on function public.set_integration_secret(text, text, text) from public, anon;
revoke all on function public.delete_integration_secret(text, text) from public, anon;
grant execute on function public.set_integration_secret(text, text, text) to authenticated;
grant execute on function public.delete_integration_secret(text, text) to authenticated;

-- Mọi thay đổi trạng thái, cấu hình, chế độ trả lời, điều kiện tiên quyết của đấu nối ghi nhật ký (10.1 quy tắc 9).
create or replace function public.audit_integration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
    'status', old.status, 'enabled', old.enabled, 'reply_mode', old.reply_mode,
    'config', old.config, 'prerequisites_done', old.prerequisites_done) end;
  v_after jsonb := jsonb_build_object(
    'status', new.status, 'enabled', new.enabled, 'reply_mode', new.reply_mode,
    'config', new.config, 'prerequisites_done', new.prerequisites_done);
begin
  if v_before = v_after then
    return new;
  end if;
  perform public.write_audit(
    'integration.update',
    'integrations',
    new.key,
    jsonb_build_object('integration', new.key, 'before', v_before, 'after', v_after, 'showroom_id', new.showroom_id)
  );
  return new;
end;
$$;

create trigger integrations_audit after insert or update on public.integrations
  for each row execute function public.audit_integration_change();
