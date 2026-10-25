"use client";
/* eslint-disable @next/next/no-img-element -- local object URL preview */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImagePlus, Link2, LoaderCircle, Plus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCurrentUserId } from "@/lib/supabase/client-auth";
import { createClient } from "@/lib/supabase/client";
import { atomicSave, atomicSaveMessage } from "@/lib/atomic-save";
import {
  TWEET_MAX_LENGTH,
  TWEET_RAW_MAX_LENGTH,
  tweetContentLength,
  tweetContentRemaining,
  tweetContentUrls,
} from "@/lib/tweet-content";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { RefreshStatus } from "@/components/ui/refresh-status";
import { FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { cn } from "@/lib/utils";
import { prepareTweetImage, validateTweetImage } from "@/lib/tweet-image";
import { QuotedPostCard } from "@/components/cards/QuotedPostCard";
import type { QuotedPost } from "@/types";
import type { Database } from "@/types/database";

type TweetValues = {
  content: string; image_path: string | null; expires_at: string | null;
  quoted_type: string | null; quoted_id: string | null;
  poll_multiple: boolean; poll_anonymous: boolean; poll_allow_options: boolean;
  poll_enabled: boolean;
};
type TweetSaveAttempt = { values: TweetValues; userId: string | null; pollOptions: string[]; mentionIds: string[] };
type TweetConfirmation = Database["public"]["Tables"]["tweets"]["Row"] & {
  tweet_poll_options: { text: string; sort_order: number; created_by: string }[];
  tweet_mentions: { profile_id: string }[];
};

/** つぶやきフォーム。tweet を渡すと編集モード */
export type TweetFormHandle = { save: () => void };
export const TweetForm = forwardRef<
  TweetFormHandle,
  {
    tweet?: { id: string; content: string; quoted?: QuotedPost };
    initialStory?: boolean;
    /** 引用する投稿。新規作成時だけ指定でき、あとから引用先は変えられない。 */
    quote?: Exclude<QuotedPost, { kind: "missing" }>;
    onDone: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function TweetForm({ tweet, initialStory = false, quote, onDone, onDirtyChange }, ref) {
  const router = useRouter();
  const editing = !!tweet;
  const [content, setContent] = useState(tweet?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [draftId] = useState(() => tweet?.id ?? crypto.randomUUID());
  const saveState = useRef({ uncertain: false });
  const pendingSave = useRef<TweetSaveAttempt | null>(null);
  const uploadedImage = useRef<{ file: File; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiresIn24Hours, setExpiresIn24Hours] = useState(initialStory);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; display_name: string; mention_reading: string | null }>>([]);
  const [membersFailed, setMembersFailed] = useState(false);
  const [membersAttempt, setMembersAttempt] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(true);
  const [pollAllowOptions, setPollAllowOptions] = useState(false);
  const mentionMatch = content.match(/@([^\s@\n]*)$/);
  const mentionQuery = mentionMatch?.[1]?.toLocaleLowerCase("ja") ?? null;
  const selectedMentions = members.filter(
    (member) =>
      selectedMentionIds.includes(member.id) &&
      content.includes(`@${member.display_name}`),
  );
  const imagePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile]);
  const initialContent = tweet?.content ?? "";
  const effectiveLength = tweetContentLength(content);
  const remaining = tweetContentRemaining(content);
  const overLimit = remaining < 0;
  const urls = useMemo(() => tweetContentUrls(content), [content]);
  const progress = Math.min(100, (effectiveLength / TWEET_MAX_LENGTH) * 100);

  useEffect(() => {
    onDirtyChange?.(content !== initialContent || !!imageFile || expiresIn24Hours !== initialStory || pollEnabled);
  }, [content, imageFile, expiresIn24Hours, initialContent, initialStory, onDirtyChange, pollEnabled]);
  useImperativeHandle(ref, () => ({ save: () => { void submit(); } }));
  useFormDraft({ dirty: false, busy: saving, onSave: submit });
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void Promise.resolve(supabase
      .from("profiles")
      .select("id, display_name, mention_reading")
      .eq("status", "active")
      .order("display_name"))
      .then(({ data, error: readError }) => {
        if (!active) return;
        if (readError) { setMembersFailed(true); return; }
        setMembers(data ?? []);
      }).catch(() => { if (active) setMembersFailed(true); });
    return () => { active = false; };
  }, [membersAttempt]);

  function selectMention(member: { id: string; display_name: string }) {
    setContent((value) => value.replace(/@([^\s@\n]*)$/, `@${member.display_name} `));
    setSelectedMentionIds((ids) => ids.includes(member.id) ? ids : [...ids, member.id]);
  }

  function removeMention(member: { id: string; display_name: string }) {
    setContent((value) =>
      value.replaceAll(`@${member.display_name}`, "").replace(/ {2,}/g, " "),
    );
    setSelectedMentionIds((ids) => ids.filter((id) => id !== member.id));
  }



  async function submit() {
    if (saving) return;
    const text = content.trim();
    const cleanPollOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (imageFile && !expiresIn24Hours) {
      setError("画像はストーリーにだけ追加できます");
      return;
    }
    if (tweetContentLength(text) > TWEET_MAX_LENGTH) {
      setError(`本文は${TWEET_MAX_LENGTH.toLocaleString()}文字以内にしてください`);
      return;
    }
    if (!editing && pollEnabled && cleanPollOptions.length < 1) {
      setError("投票の選択肢を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();

      if (!pendingSave.current) {
        const userId = await getCurrentUserId(supabase);
        if (!userId) {
          setError("ログイン情報を確認できませんでした");
          setSaving(false);
          return;
        }
        let imagePath: string | null = null;
        if (!editing && imageFile && uploadedImage.current?.file === imageFile) {
          imagePath = uploadedImage.current.path;
        } else if (!editing && imageFile) {
          let prepared: Blob;
          try {
            prepared = await prepareTweetImage(imageFile);
          } catch (imageError) {
            setError(imageError instanceof Error ? imageError.message : "画像を変換できませんでした");
            setSaving(false);
            return;
          }
          try {
            const response = await fetch("/api/tweet-image/upload", {
              method: "POST", headers: { "Content-Type": prepared.type }, body: prepared,
            });
            const result = await response.json();
            if (!response.ok || typeof result.path !== "string") throw new Error("Upload failed");
            imagePath = result.path;
            uploadedImage.current = { file: imageFile, path: result.path };
          } catch {
            setError("画像をアップロードできませんでした");
            setSaving(false);
            return;
          }
        }
        const expiresAt = expiresIn24Hours ? new Date(Date.now() + 86400000).toISOString() : null;
        const activeMentionIds = selectedMentionIds.filter((profileId) => {
          const member = members.find((candidate) => candidate.id === profileId);
          return member ? text.includes(`@${member.display_name}`) : false;
        });
        pendingSave.current = {
          userId,
          values: { content: text, image_path: imagePath, expires_at: expiresAt,
            quoted_type: quote?.kind ?? null, quoted_id: quote?.id ?? null,
            poll_multiple: pollEnabled && pollMultiple, poll_anonymous: pollAnonymous,
            poll_allow_options: pollEnabled && pollAllowOptions, poll_enabled: pollEnabled },
          pollOptions: editing || !pollEnabled ? [] : cleanPollOptions,
          mentionIds: editing ? [] : [...new Set(activeMentionIds)].sort(),
        };
      }
      const attempt = pendingSave.current;
      const result = await atomicSave(saveState.current, async () => {
        const response = await supabase.rpc("save_tweet", {
          p_id: draftId, p_values: editing ? { content: attempt.values.content } : attempt.values,
          p_poll_options: attempt.pollOptions, p_mention_ids: attempt.mentionIds,
          p_edit: editing, p_expected_content: tweet?.content ?? null,
        });
        const value = response.data;
        const data = value && typeof value === "object" && !Array.isArray(value) && value.id === draftId ? draftId : null;
        return { data, error: response.error };
      }, async () => {
        const { data, error: readError } = await supabase.from("tweets")
          .select("*,tweet_poll_options(text,sort_order,created_by),tweet_mentions(profile_id)")
          .eq("id", draftId).single();
        if (readError || !data) return null;
        const saved = data as unknown as TweetConfirmation;
        if (saved.user_id !== attempt.userId || saved.content !== attempt.values.content) return null;
        if (editing) return draftId;
        if (saved.image_path !== attempt.values.image_path
          || saved.quoted_type !== attempt.values.quoted_type || saved.quoted_id !== attempt.values.quoted_id
          || saved.poll_multiple !== attempt.values.poll_multiple || saved.poll_anonymous !== attempt.values.poll_anonymous
          || saved.poll_allow_options !== attempt.values.poll_allow_options
          || (saved.expires_at ? Date.parse(saved.expires_at) : null) !== (attempt.values.expires_at ? Date.parse(attempt.values.expires_at) : null)) return null;
        const options = [...saved.tweet_poll_options].sort((a, b) => a.sort_order - b.sort_order);
        if (options.length < attempt.pollOptions.length
          || attempt.pollOptions.some((text, i) => !options.some((option) => option.text === text && option.sort_order === i && option.created_by === attempt.userId))) return null;
        if (JSON.stringify(saved.tweet_mentions.map((mention) => mention.profile_id).sort()) !== JSON.stringify(attempt.mentionIds)) return null;
        return draftId;
      });
      if (!result.ok) {
        setUnconfirmed(result.reason === "unknown");
        if (result.reason !== "unknown") pendingSave.current = null;
        setError(atomicSaveMessage(result.reason));
        return;
      }
      setUnconfirmed(false);
      setContent("");
      setImageFile(null);
      setExpiresIn24Hours(false);
      router.refresh();
      onDone();
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3 pb-4">
    <fieldset disabled={saving || unconfirmed} className="min-w-0 space-y-3">
      <section className="overflow-hidden rounded-card border border-separator/80 bg-card transition-colors focus-within:border-accent/50">
        <Textarea
          aria-label="つぶやき本文"
          rows={7}
          maxLength={TWEET_RAW_MAX_LENGTH}
          placeholder={quote ? "ひとこと添える（なくても投稿できます）" : "つぶやきを入力"}
          value={content}
          onKeyDown={(event) => {
            // Keep Enter as a newline in the post body. In particular, do not
            // let an edit modal (or a parent keyboard shortcut) treat it as
            // the confirmation key.
            if (event.key === "Enter") event.stopPropagation();
          }}
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError(null);
          }}
          className="min-h-[180px] rounded-none border-0 bg-transparent px-4 py-4 text-[16px] leading-7 placeholder:text-muted/75 focus:border-transparent"
        />
        {(mentionQuery !== null || (membersFailed && selectedMentionIds.length > 0)) && (
          <div className="border-t border-separator bg-bg p-2">
            <p className="px-2 pb-1 text-micro">メンションする人</p>
            <RefreshStatus failed={membersFailed} busy={false} hasData={members.length > 0} label="メンション先"
              retry={() => { setMembersFailed(false); setMembersAttempt((value) => value + 1); }} />
            {mentionQuery !== null && <div className="max-h-40 overflow-y-auto">
              {members
                .filter((member) => {
                  const displayName = member.display_name.toLocaleLowerCase("ja");
                  const reading = member.mention_reading?.toLocaleLowerCase("ja") ?? "";
                  return displayName.includes(mentionQuery) || reading.includes(mentionQuery);
                })
                .slice(0, 6)
                .map((member) => (
                  <button data-ui-action
                    key={member.id}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] active:bg-card"
                    onClick={() => selectMention(member)}
                  >
                    <span className="min-w-0 flex-1 truncate">@{member.display_name}</span>
                    <span className="shrink-0 text-[12px] font-semibold text-accent">追加</span>
                  </button>
                ))}
            </div>}
          </div>
        )}
        {selectedMentions.length > 0 && (
          <div className="border-t border-separator bg-bg/60 px-3 py-2" aria-live="polite">
            <p className="mb-1.5 text-micro">メンション中</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedMentions.map((member) => (
                <button data-ui-action
                  key={member.id}
                  type="button"
                  onClick={() => removeMention(member)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent/10 px-2.5 text-[12px] font-semibold text-accent"
                  aria-label={`@${member.display_name} のメンションを外す`}
                >
                  @{member.display_name}<X size={13} />
                </button>
              ))}
            </div>
          </div>

        )}
        <div className="border-t border-separator/70 bg-bg/35">
          <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0 text-[12px] text-muted2">
              {urls.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Link2 size={14} className="text-accent" />
                  URL {urls.length}件 · 1件23文字換算
                </span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[12px] font-semibold tabular-nums",
                overLimit ? "text-danger" : remaining <= 100 ? "text-warning" : "text-muted2",
              )}
            >
              {effectiveLength.toLocaleString()} / {TWEET_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
          <div className="h-1 bg-separator/70">
            <div
              className={cn(
                "h-full rounded-r-full transition-[width,background-color] duration-200",
                overLimit ? "bg-danger" : remaining <= 100 ? "bg-warning" : "bg-accent",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      {(quote ?? tweet?.quoted) && (
        <QuotedPostCard quoted={(quote ?? tweet?.quoted)!} linked={false} />
      )}

      {!editing && (
        <div className="space-y-3">
          <Toggle
            label="ストーリーとして投稿"
            description="投稿から24時間後に自動で非表示になります。"
            checked={expiresIn24Hours}
            onChange={() => setExpiresIn24Hours((value) => {
              if (value) setImageFile(null);
              return !value;
            })}
          />
          <Toggle
            label="投票を追加"
            checked={pollEnabled}
            onChange={() => setPollEnabled((value) => !value)}
          />
          {pollEnabled && (
            <section data-ui-section aria-label="投票の設定" className="space-y-3 rounded-card border border-separator bg-card p-3">
              <div className="space-y-2">
                {pollOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={option}
                      aria-label={`選択肢${index + 1}`}
                      maxLength={80}
                      placeholder={`選択肢${index + 1}`}
                      className="flex-1"
                      onChange={(event) => setPollOptions((options) => options.map((value, optionIndex) => optionIndex === index ? event.target.value : value))}
                    />
                    <Button variant="ghost" size="icon" aria-label={`選択肢${index + 1}を削除`} disabled={pollOptions.length <= 1} onClick={() => setPollOptions((options) => options.filter((_, optionIndex) => optionIndex !== index))}>
                      <X size={17} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPollOptions((options) => [...options, ""])}>
                <Plus size={15} />選択肢を追加
              </Button>
              <div className="divide-y divide-separator/70 overflow-hidden rounded-xl border border-separator">
                <Toggle variant="row" label="複数投票" checked={pollMultiple} onChange={() => setPollMultiple((value) => !value)} />
                <Toggle variant="row" label="匿名投票" checked={pollAnonymous} onChange={() => setPollAnonymous((value) => !value)} />
                <Toggle variant="row" label="選択肢の追加を許可" checked={pollAllowOptions} onChange={() => setPollAllowOptions((value) => !value)} />
              </div>
            </section>
          )}
        </div>
      )}
      {!editing && (
        <div className="space-y-2">

          {expiresIn24Hours && (
            <div className="space-y-2">
              {imagePreview && (
                <div className="relative overflow-hidden rounded-card border border-separator">
                  <img src={imagePreview} alt="投稿画像のプレビュー" className="max-h-80 w-full object-contain" />
                  <Button variant="secondary" size="icon" aria-label="画像を外す" onClick={() => setImageFile(null)} className="absolute right-2 top-2">
                    <X size={17} />
                  </Button>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus size={18} />{imageFile ? "画像を変更" : "画像を追加"}
              </Button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (!file) return;
                  try {
                    if (file) validateTweetImage(file);
                    setImageFile(file);
                    setError(null);
                  } catch (fileError) {
                    setImageFile(null);
                    setError(fileError instanceof Error ? fileError.message : "画像を選択できませんでした");
                  }
                }} />
            </div>
          )}
        </div>
      )}

      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <FormModalFooter>
        <Button size="lg" onClick={submit} disabled={saving || (!content.trim() && !imageFile && !pollEnabled && !quote) || overLimit}>
          {saving ? (
            <>
              <LoaderCircle size={18} className="animate-spin" />
              保存中…
            </>
          ) : (
            <>
              <Send size={17} />
              {unconfirmed ? "保存結果を確認" : editing ? "更新する" : "投稿する"}
            </>
          )}
        </Button>
      </FormModalFooter>
    </div>
  );
});
