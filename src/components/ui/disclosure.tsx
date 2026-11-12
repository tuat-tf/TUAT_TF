"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { animateSize } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;
  // 閉じる動きが終わるまで中身を残す。開いていないときは今までどおり描画しない。
  const [previous, setPrevious] = useState(expanded);
  const [closing, setClosing] = useState(false);
  if (previous !== expanded) {
    setPrevious(expanded);
    setClosing(!expanded);
  }
  const panelRef = useRef<HTMLDivElement>(null);
  const animated = useRef(expanded);

  useLayoutEffect(() => {
    if (animated.current === expanded) return;
    animated.current = expanded;
    const node = panelRef.current;
    if (!node) return;
    const shut = { height: "0px", opacity: 0 };
    const shown = { height: `${node.scrollHeight}px`, opacity: 1 };
    if (expanded) animateSize(node, [shut, shown], { duration: 200 });
    else animateSize(node, [shown, shut], { duration: 200, hold: true, onFinish: () => setClosing(false) });
  }, [expanded]);

  function toggle() {
    const next = !expanded;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className={cn("border-t border-separator/70", className)}>
      <button
        type="button"
        data-ui-disclosure
        onClick={toggle}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left pressable"
      >
        <span className="min-w-0 flex-1 text-headline">{title}</span>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </button>
      {(expanded || closing) && <div ref={panelRef} className="pb-3">{children}</div>}
    </div>
  );
}
