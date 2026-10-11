"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { useToast } from "@/components/ui/toast";
import { STAFF } from "@/lib/demo/data";
import { kocDenied, kocReducer, type KocAction, type KocWho } from "@/lib/koc/actions";
import { kocSeed } from "@/lib/koc/data";
import type { KocData } from "@/lib/koc/types";

import { useShell } from "../shell-context";
import { useCrm } from "../store";

// Dữ liệu KOL, KOC của bản demo, sống trong khu /kol (đổi tab con không mất). Mọi thao tác đi qua kocDenied
// trước khi đổi dữ liệu, như server action của bản thật.

type Act = (a: DistributiveOmit<KocAction, "actor" | "at">, ok?: string) => boolean;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface KocCtx {
  data: KocData;
  who: KocWho;
  act: Act;
  /** Kiểm trước một thao tác để ẩn nút không được dùng (DESIGN.md 2, điều 4). */
  can: (a: DistributiveOmit<KocAction, "actor" | "at">) => boolean;
  staffName: (id: string) => string;
}

const Ctx = createContext<KocCtx | null>(null);

export function KocProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(kocReducer, undefined, kocSeed);
  const { perms, isOwner, userId } = useShell();
  const { who: crmWho } = useCrm();
  const toast = useToast();
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  const who = useMemo<KocWho>(
    () => ({ perms, isOwner, readOnly: Boolean(crmWho.readOnly) }),
    [perms, isOwner, crmWho.readOnly],
  );

  const act = useCallback<Act>(
    (partial, ok) => {
      const a = { ...partial, actor: userId, at: new Date().toISOString() } as KocAction;
      const why = kocDenied(latest.current, a, who);
      if (why) {
        toast(why, "err");
        return false;
      }
      dispatch(a);
      if (ok) toast(ok, "ok");
      return true;
    },
    [who, userId, toast],
  );
  const can = useCallback(
    (partial: DistributiveOmit<KocAction, "actor" | "at">) =>
      kocDenied(data, { ...partial, actor: userId, at: "" } as KocAction, who) === null,
    [data, who, userId],
  );
  const staffName = useCallback((id: string) => STAFF.find((s) => s.id === id)?.fullName ?? "Người khác", []);

  const value = useMemo(() => ({ data, who, act, can, staffName }), [data, who, act, can, staffName]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKoc() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useKoc must be used inside KocProvider");
  return ctx;
}
