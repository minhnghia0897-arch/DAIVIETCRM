"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

import type { ActionResult } from "../types";

interface Role {
  id: string;
  name: string;
  isOwner: boolean;
}
interface Perm {
  key: string;
  group: string;
  label: string;
  grantable: boolean;
  sensitive: boolean;
}

export interface PermissionMatrixActions {
  toggleRolePermission: (input: { roleId: string; permission: string; on: boolean }) => Promise<ActionResult>;
  createRole: (input: { name: string }) => Promise<ActionResult>;
}

export function PermissionMatrix({
  roles,
  permissions,
  granted,
  actions: { toggleRolePermission, createRole },
}: {
  roles: Role[];
  permissions: Perm[];
  granted: string[];
  actions: PermissionMatrixActions;
}) {
  const toast = useToast();
  const [state, setState] = useState(() => new Set(granted));
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<{ role: Role; perm: Perm } | null>(null);
  const [newRole, setNewRole] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = permissions.filter((p) => !q || p.label.toLowerCase().includes(q) || p.key.includes(q));
    const map = new Map<string, Perm[]>();
    for (const p of filtered) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()];
  }, [permissions, query]);

  function apply(role: Role, perm: Perm, on: boolean) {
    const id = `${role.id}:${perm.key}`;
    setState((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    startTransition(async () => {
      const res = await toggleRolePermission({ roleId: role.id, permission: perm.key, on });
      toast(res.message, res.ok ? "ok" : "err");
      if (!res.ok) {
        setState((s) => {
          const next = new Set(s);
          if (on) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    });
  }

  function onToggle(role: Role, perm: Perm, on: boolean) {
    if (on && perm.sensitive) setConfirm({ role, perm });
    else apply(role, perm, on);
  }

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle className="flex-1">Phân quyền</CardTitle>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createRole({ name: newRole });
              toast(res.message, res.ok ? "ok" : "err");
              if (res.ok) setNewRole("");
            });
          }}
        >
          <Input
            aria-label="Tên vai trò mới"
            placeholder="Tên vai trò mới"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="w-44"
          />
          <Button type="submit" variant="secondary" disabled={pending || newRole.trim().length < 2}>
            Tạo vai trò
          </Button>
        </form>
      </CardHeader>
      <div className="px-[14px] py-3">
        <Input
          aria-label="Tìm quyền"
          placeholder="Tìm quyền"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="sticky top-0 bg-surface-2 text-left">
            <tr>
              <th className="px-[14px] py-2 font-semibold">Quyền</th>
              {roles.map((r) => (
                <th key={r.id} className="w-32 px-3 py-2 text-center font-semibold">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => (
              <GroupRows key={group} group={group} colSpan={roles.length + 1}>
                {perms.map((p) => (
                  <tr key={p.key} className="h-10 border-t border-line-2 hover:bg-surface-2">
                    <td className="px-[14px] py-1" title={p.key}>
                      {p.label}
                      {p.sensitive ? (
                        <span className="ml-2 rounded-pill bg-warn-soft px-2 py-0.5 text-pill font-semibold text-warn">
                          Nhạy cảm
                        </span>
                      ) : null}
                      {!p.grantable ? (
                        <span className="ml-2 text-label text-text-weak">Chỉ Owner</span>
                      ) : null}
                    </td>
                    {roles.map((r) => {
                      const on = state.has(`${r.id}:${p.key}`);
                      if (!p.grantable && !r.isOwner) return <td key={r.id} />;
                      const locked = r.isOwner && p.key !== "lead.receive";
                      return (
                        <td key={r.id} className="text-center">
                          <span className="inline-flex justify-center">
                            <Switch
                              checked={on}
                              disabled={locked || pending}
                              label={`${p.label}, ${r.name}`}
                              onCheckedChange={(next) => onToggle(r, p, next)}
                            />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Bật quyền nhạy cảm"
        description={
          confirm
            ? `Bật "${confirm.perm.label}" cho ${confirm.role.name}. Mọi người thuộc vai trò này sẽ có quyền ngay ở lần tải trang tiếp theo, và mọi lượt dùng được ghi nhật ký.`
            : ""
        }
        confirmLabel="Bật quyền"
        onConfirm={() => confirm && apply(confirm.role, confirm.perm, true)}
      />
    </Card>
  );
}

function GroupRows({
  group,
  colSpan,
  children,
}: {
  group: string;
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-t border-line bg-surface-2">
        <th colSpan={colSpan} className="px-[14px] py-1.5 text-left text-label font-semibold text-text-weak">
          {group}
        </th>
      </tr>
      {children}
    </>
  );
}
