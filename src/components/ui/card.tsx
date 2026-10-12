import * as React from "react";
import { cn } from "@/lib/utils";

/** iOS 風カード（白背景・角丸16px・薄ボーダー） */
export function Card({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-ui-panel
      className={cn(
        "rounded-card bg-card border border-separator/70",
        className,
      )}
      {...props}
    />
  );
}
