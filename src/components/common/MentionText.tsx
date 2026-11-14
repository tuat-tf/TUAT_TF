import Link from "next/link";
import type { ReactNode } from "react";
import { Linkify } from "@/components/common/Linkify";
import { mentionSpans } from "@/lib/mentions";
import type { TweetMention } from "@/types";

/** 保存されているメンションの「@名前」をリンクにする。位置の決め方は保存時の判定（lib/mentions）と同じ。 */
export function MentionText({ text, mentions }: { text: string; mentions?: TweetMention[] }) {
  const byName = new Map<string, TweetMention>();
  for (const mention of mentions ?? []) if (mention.display_name && !byName.has(mention.display_name)) byName.set(mention.display_name, mention);
  const spans = mentionSpans(text, [...byName.keys()]);
  if (!spans.length) return <Linkify text={text} hashtags />;
  const parts: ReactNode[] = [];
  let from = 0;
  for (const span of spans) {
    if (span.start > from) parts.push(<Linkify key={`t${from}`} text={text.slice(from, span.start)} hashtags />);
    parts.push(
      <Link data-ui-link key={`m${span.start}`} href={`/members/${byName.get(span.name)!.profile_id}`} prefetch={false} className="font-semibold text-accent" onClick={(event) => event.stopPropagation()}>
        {text.slice(span.start, span.end)}
      </Link>,
    );
    from = span.end;
  }
  if (from < text.length) parts.push(<Linkify key={`t${from}`} text={text.slice(from)} hashtags />);
  return <>{parts}</>;
}
