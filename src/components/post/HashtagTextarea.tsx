"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { Textarea, TEXTAREA_CLASS, type TextareaProps } from "@/components/ui/textarea";
import { HashtagSuggestions } from "@/components/post/HashtagSuggestions";
import { useHashtagSuggestions } from "@/hooks/use-hashtag-suggestions";
import { completeHashtag, hashtagQueryAt, splitHashtags } from "@/lib/hashtags";
import { cn } from "@/lib/utils";

/**
 * #タグを入力中から青で見せる入力欄。文字を透明にした入力欄の下へ、同じ見た目・同じ位置で
 * 色付きの文字を重ねる（入力・変換・選択は普通の textarea のまま）。
 */
export const HashtagTextarea = forwardRef<HTMLTextAreaElement, TextareaProps & { value: string; wrapperClassName?: string }>(
  function HashtagTextarea({ value, className, wrapperClassName, onScroll, ...props }, ref) {
    const mirror = useRef<HTMLDivElement>(null);
    return (
      <div className={cn("relative min-w-0", wrapperClassName)}>
        <div
          ref={mirror}
          aria-hidden="true"
          data-ui-field-mirror
          className={cn(TEXTAREA_CLASS, className, "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words")}
        >
          {splitHashtags(value).map((part, index) => typeof part === "string"
            ? part
            : <span key={index} className="text-accent">#{part.tag}</span>)}
          {/* A trailing newline needs something after it to take up a line. */}
          {"​"}
        </div>
        <Textarea
          ref={ref}
          value={value}
          // block: an inline-block textarea leaves a baseline gap below it, so the colored layer (inset-0)
          // would be taller than the field and show a second border.
          className={cn(className, "relative block bg-transparent! text-transparent! caret-ink")}
          onScroll={(event) => {
            if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop;
            onScroll?.(event);
          }}
          {...props}
        />
      </div>
    );
  },
);

/** 色付けと候補を1つにまとめた入力欄（練習記録の自由記述欄など）。 */
export function HashtagField({
  value,
  onValueChange,
  ...props
}: Omit<TextareaProps, "value" | "onChange" | "onSelect"> & { value: string; onValueChange: (value: string) => void }) {
  const { ref, ...hashtag } = useHashtagCompletion(value, onValueChange);
  return (
    <>
      <HashtagTextarea
        ref={ref}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          hashtag.track(event);
        }}
        onSelect={hashtag.track}
        {...props}
      />
      <HashtagSuggestions items={hashtag.suggestions} onSelect={hashtag.select} className="mt-2" />
    </>
  );
}

/**
 * カーソル位置の書きかけの #タグ に候補を出し、選んだら置き換える。
 * track を入力欄の onChange と onSelect で呼ぶ。
 */
export function useHashtagCompletion(value: string, setValue: (value: string) => void) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const nextCaret = useRef<number | null>(null);
  const suggestions = useHashtagSuggestions(caret === null ? null : hashtagQueryAt(value, caret));

  // Put the cursor right after the inserted tag once the new text is in the field.
  useLayoutEffect(() => {
    const at = nextCaret.current;
    if (at === null || !ref.current) return;
    nextCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(at, at);
  }, [value]);

  const track = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget as HTMLTextAreaElement | null;
    if (!field) return;
    setCaret(field.selectionStart === field.selectionEnd ? field.selectionStart : null);
  }, []);

  function select(tag: string) {
    const next = completeHashtag(value, caret ?? value.length, tag);
    nextCaret.current = next.caret;
    setCaret(next.caret);
    setValue(next.text);
  }

  return { ref, suggestions, select, track };
}
