"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { cn } from "@/lib/utils";

// DESIGN.md 5.14: toast trên cùng giữa màn hình, 2,6 giây, dùng cùng động từ với nút.
type Tone = "ok" | "err";
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const show = useCallback((message: string, tone: Tone = "ok") => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4"
      >
        {toast ? (
          <p
            role="status"
            className={cn(
              "rounded-control px-4 py-2.5 shadow-pop",
              toast.tone === "ok" ? "bg-ok text-white" : "bg-err text-white",
            )}
          >
            {toast.message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
