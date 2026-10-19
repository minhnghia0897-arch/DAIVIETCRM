-- Link mời theo vị trí (Owner chốt 19/10/2026): Owner chọn vị trí, CRM tạo một link; người nhận mở link, tự nhập họ
-- tên, email, mật khẩu để tạo tài khoản của mình và vào làm ngay với quyền của vị trí đó. Owner không phải nhập email
-- hay đặt mật khẩu hộ.
--
-- - Mỗi link cho một người: dùng được một lần, hết hạn sau 7 ngày, Owner hủy được khi chưa dùng.
-- - Chỉ lưu mã băm SHA-256 của link; link đầy đủ chỉ hiện một lần cho người tạo.
-- - Không mời được vị trí Owner.
-- - Ghi chỉ qua máy chủ CRM (service role, sau khi kiểm settings.users); người dùng không ghi thẳng được.

create table public.invite_links (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms (id),
  role_id uuid not null references public.roles (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Ghi chú của người tạo để nhớ link gửi cho ai, ví dụ "Chị Hoa telesale ca tối". Không bắt buộc.
  note text check (char_length(note) <= 120),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

create index invite_links_showroom_idx on public.invite_links (showroom_id, created_at desc);

create trigger invite_links_updated_at before update on public.invite_links
  for each row execute function public.set_updated_at();

alter table public.invite_links enable row level security;

create policy invite_links_select on public.invite_links for select to authenticated
  using (showroom_id = (select public.current_showroom_id()) and (select public.has_perm('settings.users')));

revoke insert, update, delete on public.invite_links from authenticated, anon;
