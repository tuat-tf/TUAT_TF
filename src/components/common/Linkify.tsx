"use client";

import { Fragment, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hashtagSearchHref, splitHashtags } from "@/lib/hashtags";

// [表示文字](url) / [表示文字](<url>) 形式（Discord風）
const MD_LINK = /\[([^\]]+)\]\(<?(https?:\/\/[^\s)]+)>?\)/g;
// 素のURL
const URL_RE = /(https?:\/\/[^\s]+)/g;

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function openLink(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    router.push(`${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <a data-ui-link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openLink}
      className="break-all text-accent underline"
    >
      {children}
    </a>
  );
}

// 末尾に付きがちな句読点・閉じ括弧はリンクから除外
function splitTrailing(url: string): [string, string] {
  const m = url.match(/[)\]｝」』。、，．,.!?！？]+$/);
  if (!m) return [url, ""];
  return [url.slice(0, url.length - m[0].length), m[0]];
}

/** #タグをそのタグの検索結果へのリンクにする */
function renderHashtags(text: string, keyBase: string): ReactNode {
  return splitHashtags(text).map((part, i) => typeof part === "string" ? (
    <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
  ) : (
    <Link data-ui-link key={`${keyBase}-${i}`} href={hashtagSearchHref(part.tag)} prefetch={false} className="text-accent" onClick={(event) => event.stopPropagation()}>
      #{part.tag}
    </Link>
  ));
}

/** 素のURLを含むプレーンテキストをリンク化 */
function renderBareUrls(text: string, keyBase: string, hashtags: boolean): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      const [url, trail] = splitTrailing(part);
      return (
        <Fragment key={`${keyBase}-${i}`}>
          <Anchor href={url}>{url}</Anchor>
          {trail}
        </Fragment>
      );
    }
    return <Fragment key={`${keyBase}-${i}`}>{hashtags ? renderHashtags(part, `${keyBase}-${i}`) : part}</Fragment>;
  });
}

/**
 * 自由文中のリンクを自動でリンク化。
 * - [表示文字](https://...) のように文字でリンクを貼れる（Discord風）
 * - 素の https://... もそのままリンク化
 * - hashtags を付けると #タグ も検索へのリンクにする（つぶやき・返信）
 */
export function Linkify({ text, hashtags = false }: { text: string; hashtags?: boolean }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(MD_LINK);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(...renderBareUrls(text.slice(last, m.index), `t${key}`, hashtags));
    }
    nodes.push(
      <Anchor key={`l${key}`} href={m[2]}>
        {m[1]}
      </Anchor>,
    );
    last = m.index + m[0].length;
    key++;
  }
  if (last < text.length) {
    nodes.push(...renderBareUrls(text.slice(last), `t${key}`, hashtags));
  }
  return <>{nodes}</>;
}
