"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { joinWithInvite, type JoinState } from "./actions";

export function JoinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWithInvite, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-label text-text-weak">Họ tên</span>
        <Input name="fullName" autoComplete="name" minLength={2} maxLength={80} required />
      </label>
      <label className="block">
        <span className="text-label text-text-weak">Email (dùng để đăng nhập)</span>
        <Input name="email" type="email" autoComplete="email" maxLength={200} required />
      </label>
      <label className="block">
        <span className="text-label text-text-weak">Mật khẩu (ít nhất 10 ký tự)</span>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
        />
      </label>
      <label className="block">
        <span className="text-label text-text-weak">Nhập lại mật khẩu</span>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-label text-err">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản và vào CRM"}
      </Button>
    </form>
  );
}
