"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Check, Plus } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TweetPollVoter } from "@/types";

/**
 * 投票の表示と操作。つぶやきとノート記事で同じ見た目・同じ操作にするため、
 * 保存先（どの表に書くか）だけを api で受け取り、この部品は表を知らない。
 */
export type PollOption = {
  id: string;
  text: string;
  created_by: string;
  sort_order: number;
  vote_count: number;
  voted_by_me: boolean;
  voters: TweetPollVoter[];
};

export type PollApi = {
  /** 1票入れる。失敗したら false（画面は元に戻す） */
  addVote: (optionId: string) => Promise<boolean>;
  /** 単一選択で入れ替えるときなどに、自分の票を外す */
  removeVotes: (optionIds: string[]) => Promise<boolean>;
  /** 自分が実際に入れている選択肢（読めなければ null）。古い画面の表示を正すのに使う */
  myVotes: (optionIds: string[]) => Promise<Set<string> | null>;
  /** 選択肢を追加する。保存できたら追加された選択肢を返す */
  addOption: (text: string, sortOrder: number) => Promise<PollOption | null>;
};

function PollOptionTabs({
  options,
  value,
  onChange,
  panelId,
}: {
  options: PollOption[];
  value: string;
  onChange: (optionId: string) => void;
  panelId: string;
}) {
  return (
    <div
      data-ui-group="segmented"
      role="tablist"
      aria-label="投票の選択肢"
      className="flex h-9 snap-x snap-mandatory gap-1 overflow-x-auto rounded-[10px] bg-[#e9e9eb] p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            data-ui-action
            key={option.id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${option.id}`}
            aria-controls={panelId}
            aria-selected={active}
            tabIndex={(active ? 0 : -1)}
            title={option.text}
            onClick={(event) => {
              onChange(option.id);
              event.currentTarget.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = options.findIndex((item) => item.id === option.id);
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
              onChange(options[next].id);
              const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next];
              button?.focus({ preventScroll: true });
              button?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
            }}
            className={cn(
              "h-8 min-w-24 max-w-44 shrink-0 snap-center truncate rounded-[8px] px-3 text-[13px] font-semibold transition-colors pressable",
              "gap-1.5",
              active ? "bg-white text-ink shadow-sm" : "text-muted2",
            )}
          >
            <span className="min-w-0 truncate">{option.text}</span>{" "}<span className="shrink-0 tabular-nums">{option.vote_count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PollView({
  api,
  userId,
  userName,
  userAvatarUrl,
  userBlocks,
  userGrade,
  options: initialOptions,
  multiple,
  anonymous,
  allowOptions,
}: {
  api: PollApi;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  userBlocks: import("@/types").Block[];
  userGrade: string | null;
  options: PollOption[];
  multiple: boolean;
  anonymous: boolean;
  allowOptions: boolean;
}) {
  const panelId = useId();
  const { showToast } = useToast();
  const pending = useRef(false);
  const [options, setOptions] = useState(initialOptions);
  const [saving, setSaving] = useState(false);
  // Newer server data (after a refresh) replaces the shown state unless a vote is being saved.
  const sourceKey = JSON.stringify(initialOptions.map(o => [o.id, o.vote_count, o.voted_by_me]));
  const [shownKey, setShownKey] = useState(sourceKey);
  if (shownKey !== sourceKey && !saving) { setShownKey(sourceKey); setOptions(initialOptions); }
  const [adding, setAdding] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [detailOptionId, setDetailOptionId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressVote = useRef(false);
  const detailOption = options.find((option) => option.id === detailOptionId) ?? options[0];
  const pollRef = useRef<HTMLElement>(null);
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);
  useEffect(() => {
    const root = pollRef.current;
    if (!root) return;
    const preventNativeSelection = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("input, textarea")) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    root.addEventListener("selectstart", preventNativeSelection);
    root.addEventListener("contextmenu", preventNativeSelection);
    root.addEventListener("dragstart", preventNativeSelection);
    return () => {
      root.removeEventListener("selectstart", preventNativeSelection);
      root.removeEventListener("contextmenu", preventNativeSelection);
      root.removeEventListener("dragstart", preventNativeSelection);
    };
  }, []);

  function startLongPress(optionId: string) {
    if (anonymous) return;
    suppressVote.current = false;
    longPressTimer.current = setTimeout(() => {
      suppressVote.current = true;
      setDetailOptionId(optionId);
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function handleOptionClick(optionId: string) {
    cancelLongPress();
    if (suppressVote.current) {
      suppressVote.current = false;
      return;
    }
    void vote(optionId);
  }
  const totalVotes = options.reduce((sum, option) => sum + option.vote_count, 0);

  const me = { profile_id: userId, display_name: userName, avatar_url: userAvatarUrl, blocks: userBlocks, grade: userGrade };
  /** A list page may come from an older cache: show the votes the database actually holds for me. */
  async function reconcile(ids: string[]) {
    const mine = await api.myVotes(ids);
    if (mine) applyMyVotes(mine);
  }
  function applyMyVotes(mine: Set<string>) {
    setOptions(items => items.map(item => {
      const voted = mine.has(item.id);
      if (voted === item.voted_by_me) return item;
      return { ...item, voted_by_me: voted, vote_count: Math.max(0, item.vote_count + (voted ? 1 : -1)),
        voters: voted ? (anonymous ? item.voters : [...item.voters.filter(v => v.profile_id !== userId), me]) : item.voters.filter(v => v.profile_id !== userId) };
    }));
  }
  const optionIdsKey = options.map(o => o.id).join(",");
  useEffect(() => {
    let alive = true;
    void api.myVotes(optionIdsKey.split(",")).then(mine => { if (alive && mine) applyMyVotes(mine); });
    return () => { alive = false; };
  }, [optionIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function removeLocalVotes(ids: string[]) {
    setOptions((items) => items.map((item) => ids.includes(item.id) ? {
      ...item, voted_by_me: false, vote_count: Math.max(0, item.vote_count - 1),
      voters: item.voters.filter((voter) => voter.profile_id !== userId),
    } : item));
  }

  async function vote(optionId: string) {
    if (pending.current) return;
    const target = options.find((option) => option.id === optionId);
    if (!target) return;
    pending.current = true;
    setSaving(true);
    try {
      // One choice: clear my vote on every other option, not only the ones this screen believes I chose.
      const removedIds = target.voted_by_me ? [optionId] : !multiple ? options.filter((option) => option.id !== optionId).map((option) => option.id) : [];
      if (removedIds.length) {
        if (!await api.removeVotes(removedIds)) throw new Error("remove failed");
        removeLocalVotes(options.filter(option => removedIds.includes(option.id) && option.voted_by_me).map(option => option.id));
      }
      if (!target.voted_by_me) {
        if (!await api.addVote(optionId)) throw new Error("add failed");
        setOptions((items) => items.map((item) => item.id === optionId ? {
          ...item, voted_by_me: true, vote_count: item.vote_count + 1,
          voters: anonymous ? item.voters : [...item.voters.filter((voter) => voter.profile_id !== userId), me],
        } : item));
      }
    } catch {
      showToast("投票を保存できませんでした。通信状態を確認して、もう一度お試しください");
    } finally {
      await reconcile(options.map(option => option.id));
      pending.current = false; setSaving(false);
    }
  }

  async function addOption() {
    const text = newOption.trim();
    if (!text || pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      const created = await api.addOption(text, options.length);
      if (!created) throw new Error("add option failed");
      setOptions((items) => [...items, created]);
      setNewOption(""); setAdding(false);
    } catch { showToast("選択肢を追加できませんでした。もう一度お試しください"); }
    finally { pending.current = false; setSaving(false); }
  }

  return (
    <section data-ui-panel ref={pollRef} className="space-y-2 rounded-card border border-separator bg-bg p-3">
      {options.map((option) => {
        const percent = totalVotes ? Math.round(option.vote_count / totalVotes * 100) : 0;
        return (
          <div key={option.id} className="space-y-1">
            <button
            data-ui-poll-option
            aria-pressed={option.voted_by_me}
            type="button"
            disabled={saving}
            onClick={() => handleOptionClick(option.id)}
            onPointerDown={(event) => { if (event.button !== 0) return; window.getSelection()?.removeAllRanges(); startLongPress(option.id); }}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onContextMenu={(event) => {
              if (anonymous) return;
              event.preventDefault();
              setDetailOptionId(option.id);
            }}
            className={cn(
              "relative flex disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 min-h-11 w-full select-none touch-manipulation items-center overflow-hidden rounded-xl border px-3 text-left [-webkit-touch-callout:none]",
              option.voted_by_me ? "border-2 border-accent bg-card font-semibold text-accent" : "border-separator bg-card",
            )}
          >
            <span className={cn("absolute inset-y-0 left-0", option.voted_by_me ? "bg-accent/20" : "bg-accent/10")} style={{ width: `${percent}%` }} />
            <span className="relative min-w-0 flex-1 whitespace-pre-wrap break-words py-2 text-[14px] font-medium">{option.text}</span>
            {option.voted_by_me && <span className="relative ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white"><Check size={12} aria-hidden="true" />投票済み</span>}
            <span className="relative ml-3 text-[12px] tabular-nums">{percent}%</span>
          </button>
          </div>
        );
      })}
      {allowOptions && (
        adding ? (
          <div className="flex flex-wrap gap-2">
            <Input aria-label="追加する選択肢" disabled={saving} value={newOption} maxLength={80} autoFocus placeholder="選択肢を追加" onChange={(event) => setNewOption(event.target.value)} className="min-w-0 flex-1" />
            <Button onClick={addOption} disabled={saving || !newOption.trim()}>追加する</Button>
            <Button variant="ghost" disabled={saving} onClick={() => setAdding(false)}>キャンセル</Button>
          </div>
        ) : (
          <Button variant="ghost" disabled={saving} onClick={() => setAdding(true)}><Plus size={16} />選択肢を追加</Button>
        )
      )}
      <p className="text-micro">{totalVotes}票 ・ {multiple ? "複数選択可" : "1つ選択"} ・ {anonymous ? "匿名" : "記名"}{options.some(o => o.voted_by_me) ? ` ・ あなたの投票：${options.filter(o => o.voted_by_me).map(o => o.text).join("、")}` : " ・ まだ投票していません"}</p>
      {!anonymous && <Button variant="ghost" onClick={() => setDetailOptionId(options[0]?.id ?? null)}>投票者を確認</Button>}
      {!anonymous && detailOptionId && detailOption && (
        <Sheet open onOpenChange={(open) => !open && setDetailOptionId(null)}>
          <SheetContent
            title={"\u6295\u7968\u8005"}
            autoFocus={false}
            className="flex h-[calc(100dvh-12px)] flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col"
          >
          <div
            className="flex min-h-0 flex-1 flex-col"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 pb-3">
              <PollOptionTabs options={options} value={detailOption.id} onChange={setDetailOptionId} panelId={panelId} />
            </div>
            <section id={panelId} role="tabpanel" aria-labelledby={`${panelId}-tab-${detailOption.id}`} className="min-h-0 flex-1 overflow-y-auto rounded-card border border-separator bg-card">
              <div className="border-b border-separator px-4 py-3">
                <p className="text-[15px] font-semibold">{detailOption.text}</p>
                <p className="text-micro">{detailOption.vote_count}{"\u7968"}</p>
              </div>
              {detailOption.voters.length > 0 ? (
                <ul className="divide-y divide-separator">
                  {detailOption.voters.map((voter) => (
                    <li key={voter.profile_id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                      <Avatar name={voter.display_name} blocks={voter.blocks} avatarUrl={voter.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{voter.display_name}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-4 py-8 text-center text-caption">{"\u307e\u3060\u6295\u7968\u306f\u3042\u308a\u307e\u305b\u3093"}</p>}
            </section>
          </div>
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
