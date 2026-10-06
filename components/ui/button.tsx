import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// DESIGN.md 5.13 kiểu Slack: chính (nền xanh lá, xác nhận), xanh dương (bắt đầu việc mới), phụ (viền xám, chữ đậm màu chữ chính), nguy hiểm (chữ err).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-go text-white hover:bg-go-strong",
        blue: "bg-action text-white hover:bg-action-strong",
        secondary: "border border-text/30 bg-surface text-text hover:bg-surface-2",
        danger: "border border-text/30 bg-surface text-err hover:bg-err-soft",
        ghost: "text-text-weak hover:bg-surface-2 hover:text-text",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        touch: "h-11 px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
