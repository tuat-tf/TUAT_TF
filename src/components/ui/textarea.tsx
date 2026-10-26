import * as React from "react";
import { cn } from "@/lib/utils";

/** 入力欄の見た目。#タグの色付け（HashtagTextarea）が同じ文字位置に重ねるためにも使う。 */
export const TEXTAREA_CLASS = "w-full rounded-xl bg-card border border-separator px-3 py-2.5 text-base text-ink placeholder:text-muted outline-none focus:border-accent transition-colors resize-none";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** 入力内容に合わせて高さを伸ばし、入力欄内の縦スクロールをなくす。 */
  autoGrow?: boolean;
};

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ autoGrow = false, className, onInput, style, value, ...props }, forwardedRef) => {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRef = React.useCallback((node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  const resizeToContent = React.useCallback(() => {
    const element = localRef.current;
    if (!autoGrow || !element) return;
    // 測るために高さを auto へ戻すと、外側のスクロール領域が一瞬縮んで位置が上へ飛ぶ（入力中のガタつき）。
    // 測る前の位置へ戻してから描画させる。
    const scroller = scrollParent(element);
    const top = scroller?.scrollTop ?? 0;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
    if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
  }, [autoGrow]);

  React.useLayoutEffect(() => {
    if (!autoGrow) {
      // Switching UI versions must also release the height from auto-growing.
      if (!style?.height) localRef.current?.style.removeProperty("height");
      return;
    }
    resizeToContent();
  }, [autoGrow, resizeToContent, style?.height, value]);
  React.useLayoutEffect(() => {
    const element = localRef.current;
    if (!autoGrow || !element) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resizeToContent();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [autoGrow, resizeToContent]);
  return (
    <textarea
      ref={setRef}
      data-ui-field
      className={cn(
        // text-base(16px) は必須: iOS Safari は16px未満の入力欄にフォーカスすると自動ズーム→画面がガクつくため
        TEXTAREA_CLASS,
        autoGrow && "overflow-y-hidden",
        className,
      )}
      style={style}
      value={value}
      onInput={(event) => {
        // 値を渡している入力欄は、値の反映後の useLayoutEffect で1回だけ測る。
        if (value === undefined) resizeToContent();
        onInput?.(event);
      }}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY === "auto" || overflowY === "scroll") return element;
  }
  return document.scrollingElement as HTMLElement | null;
}
