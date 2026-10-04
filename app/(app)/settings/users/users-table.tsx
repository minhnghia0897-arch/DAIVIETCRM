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
import { cn } from "@/lib/utils";

import type { ActionResult } from "../types";

interface User {
  id: string;
  fullName: string;
  isActive: boolean;
  roleId: string;
}
interface Role {
  id: string;
  name: string;
  isOwner: boolean;
}
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
  inviteUser: (input: { email: string; fullName: string; roleId: string }) => Promise<ActionResult>;
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
  overrides: Override[];
  roleGrants: string[];
  permissions: Perm[];
}) {
  const { changeRole, inviteUser, resetOverrides, setPermissionOverride, setUserActive, startViewAs } =
    props.actions;
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lockTarget, setLockTarget] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const roleName = (id: string) => props.roles.find((r) => r.id === id)?.name ?? "";

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const res = await fn();
      toast(res.message, res.ok ? "ok" : "err");
    });

  return (
    <div className="space-y-3">
      <InviteCard
        roles={props.roles.filter((r) => !r.isOwner)}
        onSubmit={(v) => run(() => inviteUser(v))}
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
                      <Pill tone={u.isActive ? "ok" : "neutral"}>
                        {u.isActive ? "Đang hoạt động" : "Đã khóa"}
                      </Pill>
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
  onSubmit,
  pending,
}: {
  roles: Role[];
  onSubmit: (v: { email: string; fullName: string; roleId: string }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mời người dùng</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ email, fullName, roleId });
          }}
        >
          <label className="min-w-48 flex-1">
            <span className="text-label text-text-weak">Họ tên</span>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className="min-w-48 flex-1">
            <span className="text-label text-text-weak">Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <span className="block text-label text-text-weak">Vai trò</span>
            <select
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
          <Button type="submit" disabled={pending}>
            Gửi lời mời
          </Button>
        </form>
      </CardBody>
    </Card>
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
