import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-control border border-line bg-surface px-3 text-body placeholder:text-text-weak disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
