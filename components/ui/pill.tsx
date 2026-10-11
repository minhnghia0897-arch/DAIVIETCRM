import * as React from "react";

import { cn } from "@/lib/utils";

// DESIGN.md 5.12: pill luôn có chữ; chỉ bốn tông màu.
const tones = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  err: "bg-err-soft text-err",
  neutral: "bg-surface-2 text-text-weak",
} as const;

function Pill({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-pill font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export { Pill };
