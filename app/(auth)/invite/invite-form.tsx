"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { setPassword, type SetPasswordState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-label text-text-weak">Mật khẩu mới (ít nhất 10 ký tự)</span>
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="block">
        <span className="text-label text-text-weak">Nhập lại mật khẩu</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {state.error ? (
        <p role="alert" className="text-label text-err">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang lưu…" : "Đặt mật khẩu"}
      </Button>
    </form>
  );
}
