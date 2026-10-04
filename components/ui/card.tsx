import * as React from "react";

import { cn } from "@/lib/utils";

// DESIGN.md 3: card bo 8px, viền line, đổ bóng nhẹ; đệm 14px ngang, 12px dọc.
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-card border border-line bg-surface shadow-card", className)} {...props} />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2 border-b border-line-2 px-[14px] py-3", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-card-title font-bold", className)} {...props} />;
}

function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-[14px] py-3", className)} {...props} />;
}

export { Card, CardBody, CardHeader, CardTitle };
