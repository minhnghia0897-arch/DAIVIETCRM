"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { cn } from "@/lib/utils";

// DESIGN.md 5.14: toast giữa đáy màn hình (trên thanh tiện ích) như Slack, 2,6 giây; có nút Hoàn tác thì 5 giây.
type Tone = "ok" | "err";
/** Nút trong toast (ví dụ "Hoàn tác"); toast có nút giữ 5 giây thay vì 2,6 giây. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}
const ToastContext = createContext<(message: string, tone?: Tone, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    tone: Tone;
    action?: ToastAction;
  } | null>(null);
  const show = useCallback((message: string, tone: Tone = "ok", action?: ToastAction) => {
    const id = Date.now();
    setToast({ id, message, tone, action });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 5000 : 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-14 z-[60] flex justify-center px-4"
      >
        {toast ? (
          <p
            role="status"
            className={cn(
              "c-toast pointer-events-auto flex items-center gap-3 rounded-control px-4 py-2.5 shadow-pop",
              toast.tone === "ok" ? "bg-text text-white" : "bg-err text-white",
            )}
          >
            {toast.message}
            {toast.action ? (
              <button
                type="button"
                className="font-bold text-white underline underline-offset-2"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
