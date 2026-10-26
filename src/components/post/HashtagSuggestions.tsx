"use client";

import type { RankedHashtag } from "@/lib/hashtags";
import { cn } from "@/lib/utils";

/** 入力中の #タグ の候補。押すと書きかけのタグをそのタグで置き換える。 */
export function HashtagSuggestions({
  items,
  onSelect,
  className,
}: {
  items: RankedHashtag[];
  onSelect: (tag: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div role="listbox" aria-label="ハッシュタグの候補" className={cn("flex gap-1.5 overflow-x-auto", className)}>
      {items.map((item) => (
        <button data-ui-action
          key={item.tag}
          type="button"
          role="option"
          aria-selected={false}
          // Keep the textarea focused (and the phone keyboard open) while choosing.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(item.tag)}
          className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-accent/10 px-3 text-[13px] font-semibold text-accent pressable"
        >
          #{item.tag}
        </button>
      ))}
    </div>
  );
}
