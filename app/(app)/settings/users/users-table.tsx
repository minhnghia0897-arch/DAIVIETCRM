"use client";

import { PersonChip } from "@/components/person-chip";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ActionResult } from "../types";

interface User {
  id: string;
  fullName: string;
  isActive: boolean;
  roleId: string;
  email?: string | null;
  /** Chưa đăng nhập lần nào (chưa nhận lời mời). */
  pending?: boolean;
}
interface Role {
  id: string;
  name: string;
  isOwner: boolean;
  key?: string;
}

type LinkResult = { ok: true; message: string; link: string } | { ok: false; message: string };

/** Link mời theo vị trí chưa dùng: không có link đầy đủ (CRM chỉ giữ mã băm), chỉ để biết và hủy. */
export interface PendingInvite {
  id: string;
  roleName: string;
  note: string | null;
  expiresAt: string;
}

// Việc chính của từng vai trò có sẵn, để Owner chọn đúng vị trí khi mời. Vai trò Owner tự tạo thêm không có mô tả.
const ROLE_HINT: Record<string, string> = {
  sale_admin: "Điều phối lead, giao việc, xác nhận tiền về, quản lý sản phẩm và kho, xem chỉ số cả đội.",
  telesale: "Gọi, nhắn và chăm sóc lead được giao; tự nhận lead khi bật Trực; lên báo giá, đơn của mình.",
  marketing: "Chiến dịch quảng cáo, chi phí, nội dung; không xem số điện thoại khách, không xuất file.",
};
interface Override {
  userId: string;
  key: string;
  effect: "grant" | "revoke";
}
interface Perm {
  key: string;
  label: string;
  group: string;
}

export interface UsersTableActions {
  changeRole: (userId: string, roleId: string) => Promise<ActionResult>;
  createInviteLink: (input: { roleId: string; note?: string }) => Promise<LinkResult>;
  revokeInviteLink: (inviteId: string) => Promise<ActionResult>;
  issueLoginLink: (userId: string) => Promise<LinkResult>;
  resetOverrides: (userId: string) => Promise<ActionResult>;
  setPermissionOverride: (input: {
    userId: string;
    permission: string;
    state: "role" | "grant" | "revoke";
  }) => Promise<ActionResult>;
  setUserActive: (userId: string, active: boolean) => Promise<ActionResult>;
  startViewAs: (userId: string) => Promise<void>;
}

export function UsersTable(props: {
  actions: UsersTableActions;
  meId: string;
  canEditPermissions: boolean;
  users: User[];
  roles: Role[];
  invites: PendingInvite[];
  overrides: Override[];
  roleGrants: string[];
  permissions: Perm[];
}) {
  const {
    changeRole,
    createInviteLink,
    revokeInviteLink,
    issueLoginLink,
    resetOverrides,
    setPermissionOverride,
    setUserActive,
    startViewAs,
  } = props.actions;
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lockTarget, setLockTarget] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [issued, setIssued] = useState<{ title: string; link: string; kind: LinkKind } | null>(null);
  const roleName = (id: string) => props.roles.find((r) => r.id === id)?.name ?? "";

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const res = await fn();
      toast(res.message, res.ok ? "ok" : "err");
    });

  // Tạo link xong thì mở hộp có link và nút Sao chép để gửi riêng qua Zalo, Telegram.
  const runLink = (fn: () => Promise<LinkResult>, kind: LinkKind, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast(res.message, "err");
        return;
      }
      after?.();
      setIssued({ title: res.message, link: res.link, kind });
    });

  return (
    <div className="space-y-3">
      <InviteCard
        roles={props.roles.filter((r) => !r.isOwner)}
        invites={props.invites}
        onSubmit={(v, reset) => runLink(() => createInviteLink(v), "join", reset)}
        onRevoke={(id) => run(() => revokeInviteLink(id))}
        pending={pending}
      />
      <Card>
        <CardHeader>
          <CardTitle>Người dùng</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-line bg-surface text-left text-label text-text-weak">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Vai trò</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Quyền riêng</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {props.users.map((u) => {
                const mine = props.overrides.filter((o) => o.userId === u.id);
                const plus = mine.filter((o) => o.effect === "grant").length;
                const minus = mine.filter((o) => o.effect === "revoke").length;
                const isOwnerRow = props.roles.find((r) => r.id === u.roleId)?.isOwner;
                return (
                  <tr key={u.id} className="h-10 border-t border-line-2 hover:bg-surface-2">
                    <td className="px-[14px] py-1 font-semibold">
                      <PersonChip name={u.fullName} />
                      {u.email ? (
                        <span className="block text-label font-normal text-text-weak">{u.email}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1">
                      {props.canEditPermissions && !isOwnerRow ? (
                        <select
                          aria-label={`Vai trò của ${u.fullName}`}
                          className="h-8 rounded-control border border-line bg-surface px-2"
                          value={u.roleId}
                          disabled={pending}
                          onChange={(e) => run(() => changeRole(u.id, e.target.value))}
                        >
                          {props.roles
                            .filter((r) => !r.isOwner)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        roleName(u.roleId)
                      )}
                    </td>
                    <td className="px-3 py-1">
                      {u.isActive && u.pending ? (
                        <Pill tone="warn">Chưa vào CRM</Pill>
                      ) : (
                        <Pill tone={u.isActive ? "ok" : "neutral"}>
                          {u.isActive ? "Đang hoạt động" : "Đã khóa"}
                        </Pill>
                      )}
                    </td>
                    <td className="tabular px-3 py-1">
                      +{plus} −{minus}
                    </td>
                    <td className="px-3 py-1 text-right whitespace-nowrap">
                      {props.canEditPermissions && !isOwnerRow ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                          Chỉnh
                        </Button>
                      ) : null}{" "}
                      {u.id !== props.meId && !isOwnerRow && u.isActive ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          title={
                            u.pending
                              ? "Link mời mới khi link cũ hết hạn hoặc bị mất"
                              : "Link đặt lại mật khẩu khi người này quên mật khẩu"
                          }
                          onClick={() => runLink(() => issueLoginLink(u.id), u.pending ? "invite" : "reset")}
                        >
                          Tạo link vào CRM
                        </Button>
                      ) : null}{" "}
                      {u.id !== props.meId && !isOwnerRow && u.isActive ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startTransition(() => startViewAs(u.id))}
                        >
                          Xem như
                        </Button>
                      ) : null}{" "}
                      {u.id !== props.meId && !isOwnerRow ? (
                        u.isActive ? (
                          <Button size="sm" variant="danger" onClick={() => setLockTarget(u)}>
                            Khóa
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => run(() => setUserActive(u.id, true))}
                          >
                            Mở khóa
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={lockTarget !== null}
        onOpenChange={(o) => !o && setLockTarget(null)}
        title={`Khóa ${lockTarget?.fullName ?? ""}`}
        description="Người này bị đăng xuất và mất mọi quyền ngay. Lead và việc đang mở của họ chuyển về hàng chưa phân, sale admin được báo."
        confirmLabel="Khóa người dùng"
        danger
        onConfirm={() => lockTarget && run(() => setUserActive(lockTarget.id, false))}
      />

      {issued ? <LinkDialog {...issued} onClose={() => setIssued(null)} /> : null}

      {editing ? (
        <OverridesDrawer
          user={editing}
          roleName={roleName(editing.roleId)}
          permissions={props.permissions}
          roleHas={(key) => props.roleGrants.includes(`${editing.roleId}:${key}`)}
          overrides={props.overrides.filter((o) => o.userId === editing.id)}
          pending={pending}
          onClose={() => setEditing(null)}
          onSet={(key, state) =>
            run(() => setPermissionOverride({ userId: editing.id, permission: key, state }))
          }
          onReset={() => run(() => resetOverrides(editing.id))}
        />
      ) : null}
    </div>
  );
}

function InviteCard({
  roles,
  invites,
  onSubmit,
  onRevoke,
  pending,
}: {
  roles: Role[];
  invites: PendingInvite[];
  onSubmit: (v: { roleId: string; note?: string }, reset: () => void) => void;
  onRevoke: (inviteId: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const hint = ROLE_HINT[roles.find((r) => r.id === roleId)?.key ?? ""];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mời người dùng</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ roleId, note: note.trim() || undefined }, () => setNote(""));
          }}
        >
          <label>
            <span className="block text-label text-text-weak">Vị trí (vai trò)</span>
            <select
              aria-label="Vai trò"
              className="h-9 rounded-control border border-line bg-surface px-2"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-48 flex-1">
            <span className="text-label text-text-weak">Gửi cho ai (không bắt buộc, để anh chị nhớ)</span>
            <Input
              aria-label="Gửi cho ai"
              value={note}
              maxLength={120}
              placeholder="Ví dụ: Chị Hoa, ca tối"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={pending || !roleId}>
            Tạo link mời
          </Button>
        </form>
        {hint ? <p className="text-label text-text-weak">{hint}</p> : null}
        <p className="text-label text-text-weak">
          Gửi link riêng cho người được mời qua Zalo hoặc Telegram. Họ mở link, tự nhập họ tên, email, mật
          khẩu để tạo tài khoản của mình và vào làm ngay với quyền của vị trí này. Mỗi link cho một người,
          dùng một lần, hết hạn sau 7 ngày.
        </p>
        {invites.length ? (
          <div role="group" aria-label="Link mời chưa dùng" className="border-t border-line-2 pt-2">
            <p className="text-label font-semibold text-text-weak">Link mời chưa dùng</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    <b>{i.roleName}</b>
                    {i.note ? ` · ${i.note}` : ""}
                    <span className="block text-label text-text-weak">
                      Hết hạn {formatDateTime(i.expiresAt)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    aria-label={`Hủy link mời ${i.roleName}${i.note ? ` ${i.note}` : ""}`}
                    onClick={() => onRevoke(i.id)}
                  >
                    Hủy link
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** Hộp hiện link vừa tạo: link chỉ hiện một lần ở đây, CRM không lưu lại. */
/** join: link mời theo vị trí, người nhận tự tạo tài khoản; invite: link nhận lời mời kiểu cũ; reset: đặt lại mật khẩu. */
type LinkKind = "join" | "invite" | "reset";

function LinkDialog({
  title,
  link,
  kind,
  onClose,
}: {
  title: string;
  link: string;
  kind: LinkKind;
  onClose: () => void;
}) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Đã sao chép link", "ok");
    } catch {
      toast("Không sao chép được, bấm giữ vào ô link để chép tay", "err");
    }
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-card bg-surface p-4 shadow-pop">
          <Dialog.Title className="text-card-title font-bold">{title}</Dialog.Title>
          <Dialog.Description className="text-text-weak">
            {kind === "join"
              ? "Gửi link này riêng cho người được mời qua Zalo hoặc Telegram. Họ mở link, tự nhập họ tên, email, mật khẩu để tạo tài khoản rồi vào thẳng CRM."
              : kind === "invite"
                ? "Gửi link này riêng cho người được mời qua Zalo hoặc Telegram. Họ mở link, đặt mật khẩu (ít nhất 10 ký tự) rồi vào thẳng CRM."
                : "Gửi link này riêng cho người đó. Mở link là vào màn đặt mật khẩu mới."}
          </Dialog.Description>
          <Input
            readOnly
            aria-label="Link vào CRM"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-label"
          />
          <ul className="list-disc space-y-1 pl-5 text-label text-text-weak">
            {kind === "join" ? (
              <>
                <li>
                  Link dùng được một lần, hết hạn sau 7 ngày. CRM không hiện lại link này; mất link thì hủy ở
                  mục Link mời chưa dùng rồi tạo link mới.
                </li>
                <li>Không đăng link vào nhóm chung: ai mở link trước sẽ tạo được tài khoản vị trí này.</li>
                <li>Anh chị đừng tự mở link để thử: link để người được mời tạo tài khoản riêng của họ.</li>
              </>
            ) : (
              <>
                <li>
                  Link chỉ dùng được một lần và hết hạn sau khoảng 1 giờ. Hết hạn thì bấm Tạo link vào CRM ở
                  dòng của họ.
                </li>
                <li>Không đăng link vào nhóm chung: ai mở link trước sẽ vào được tài khoản này.</li>
              </>
            )}
            {kind !== "reset" ? (
              <li>Telesale: xếp vào ca ở Cài đặt, Ca trực; đặt chỉ tiêu ở Đội ngũ, Chỉ tiêu.</li>
            ) : null}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Button onClick={copy}>Sao chép link</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type OverrideState = "role" | "grant" | "revoke";

function OverridesDrawer(props: {
  user: User;
  roleName: string;
  permissions: Perm[];
  roleHas: (key: string) => boolean;
  overrides: Override[];
  pending: boolean;
  onClose: () => void;
  onSet: (key: string, state: OverrideState) => void;
  onReset: () => void;
}) {
  const stateOf = (key: string): OverrideState =>
    props.overrides.find((o) => o.key === key)?.effect ?? "role";
  // Quyền khác với vai trò được gom lên đầu (DESIGN.md 6.5).
  const sorted = [...props.permissions].sort(
    (a, b) => Number(stateOf(b.key) !== "role") - Number(stateOf(a.key) !== "role"),
  );
  return (
    <Dialog.Root open onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface shadow-pop">
          <div className="flex items-center gap-2 border-b border-line-2 px-[14px] py-3">
            <Dialog.Title className="flex-1 text-card-title font-bold">
              Quyền riêng của {props.user.fullName}
            </Dialog.Title>
            <Button size="sm" variant="secondary" disabled={props.pending} onClick={props.onReset}>
              Đưa về theo vai trò
            </Button>
          </div>
          <Dialog.Description className="px-[14px] py-2 text-label text-text-weak">
            Vai trò: {props.roleName}. Thu riêng luôn thắng cấp riêng. Thay đổi có hiệu lực ở lần tải trang
            tiếp theo của người này.
          </Dialog.Description>
          <ul className="flex-1 overflow-y-auto">
            {sorted.map((p) => {
              const st = stateOf(p.key);
              const fromRole = props.roleHas(p.key);
              return (
                <li
                  key={p.key}
                  className={cn("border-t border-line-2 px-[14px] py-2", st !== "role" && "bg-brand-soft")}
                  title={p.key}
                >
                  <p>{p.label}</p>
                  <div role="radiogroup" aria-label={p.label} className="mt-1 flex flex-wrap gap-1">
                    {(
                      [
                        ["role", `Theo vai trò (${fromRole ? "bật" : "tắt"})`],
                        ["grant", "Cấp riêng"],
                        ["revoke", "Thu riêng"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={st === value}
                        disabled={props.pending}
                        onClick={() => st !== value && props.onSet(p.key, value)}
                        className={cn(
                          "rounded-pill border px-2.5 py-0.5 text-pill font-semibold",
                          st === value
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-surface text-text-weak",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
