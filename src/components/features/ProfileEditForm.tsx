"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LogOut, SlidersHorizontal, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeUpdate, safeUpdateMessage } from "@/lib/safe-update";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Disclosure } from "@/components/ui/disclosure";
import { Avatar } from "@/components/common/Avatar";
import { AvatarCropEditor } from "@/components/features/AvatarCropEditor";
import { SheetHeaderSetupDialog } from "@/components/features/SheetHeaderSetupDialog";
import { recordFieldsToJson } from "@/lib/profile-normalize";
import { ALL_PROFILE_EVENTS, BLOCKS, EVENTS_BY_BLOCK, GRADE_OPTIONS, PROFILE_BLOCK_ORDER, normalizeProfileBlocks } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Block, Profile } from "@/types";
import { useProfileAvatar } from "./profile-edit/useProfileAvatar";
import { useProfileSheetSetup } from "./profile-edit/useProfileSheetSetup";
import { useProfileSignOut } from "./profile-edit/useProfileSignOut";

/** 名前・アバター・ブロック（複数可）・学年の編集フォーム（初回設定 / 後からの編集 共通） */
export function ProfileEditForm({
  profile,
  onDone,
  isSetup = false,
  enableSheetHeaderSetup = false,
  separateRecordSettings = false,
}: {
  profile: Pick<
    Profile,
    | "id"
    | "display_name"
    | "blocks"
    | "events"
    | "grade"
    | "avatar_url"
    | "sheet_name"
    | "record_source"
    | "sheet_transition"
    | "record_fields"
    | "sheet_header_signature"
  >;
  onDone: () => void;
  isSetup?: boolean;
  enableSheetHeaderSetup?: boolean;
  separateRecordSettings?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name ?? "");
  const [blocks, setBlocks] = useState<Block[]>(normalizeProfileBlocks(profile.blocks));
  const [events, setEvents] = useState<string[]>(profile.events ?? []);
  const [grade, setGrade] = useState<string | null>(profile.grade);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { avatarUrl, avatarCropFile, setAvatarCropFile, processingAvatar, avatarInputRef, selectAvatar, uploadCroppedAvatar, removeAvatar } = useProfileAvatar(profile.avatar_url, setError);
  const { sheetName, setSheetName, sheetOptions, sheetNameMissing, headerData, setHeaderData, loadingHeader, fetchHeader, openHeaderEditor } = useProfileSheetSetup(profile.sheet_name, separateRecordSettings, setError);
  const { confirmSignOut, setConfirmSignOut, signingOut, signOut } = useProfileSignOut(profile.id);

  useFormDraft({
    dirty: JSON.stringify([name, blocks, events, grade, sheetName]) !== JSON.stringify([profile.display_name ?? "", normalizeProfileBlocks(profile.blocks), profile.events ?? [], profile.grade, profile.sheet_name ?? ""]),
    busy: saving || processingAvatar || loadingHeader || signingOut,
    onSave: save,
  });
  const valid = name.trim() && blocks.length > 0 && grade;

  function selectBlock(block: Block) {
    setBlocks([block]);
  }

  function toggleEvent(ev: string) {
    setEvents((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]));
  }

  const selectedBlock = blocks[0];
  const eventOptions = selectedBlock ? ALL_PROFILE_EVENTS : [];
  const eventGroups: Block[] = ["middle_long", "short", "jump", "throw"];

  async function save() {
    try {
      if (!valid) {
        setError("すべての項目を入力してください");
        return;
      }
      setSaving(true);
      setError(null);

      if (!separateRecordSettings && enableSheetHeaderSetup && sheetName.trim()) {
        const currentHeader = await fetchHeader();
        if (!currentHeader) {
          setSaving(false);
          return;
        }
        if (
          profile.sheet_name !== sheetName.trim() ||
          profile.sheet_header_signature !== currentHeader.signature
        ) {
          setHeaderData(currentHeader);
          setSaving(false);
          return;
        }
      }

      await persistProfile(profile.record_fields, sheetName.trim() ? profile.sheet_header_signature : null);
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally { setSaving(false); }
  }

  async function persistProfile(recordFields: Profile["record_fields"], headerSignature: string | null) {
    try {
      setSaving(true);
      setError(null);
      const nextRecordSource = sheetName.trim() && (!profile.sheet_transition || profile.sheet_transition.mode === "sheet") ? "sheet" : "app";
      const switchingSource = !separateRecordSettings && Boolean(sheetName.trim()) && nextRecordSource !== (profile.record_source ?? "app");

      if (switchingSource && profile.sheet_name) {
        const response = await fetch("/api/sheets/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction: "to_sheet" }),
        });
        const reconcileResult = await response.json();
        if (!response.ok || !reconcileResult.ok) {
          setError(reconcileResult.error ?? "設定を変更できませんでした。もう一度お試しください");
          setSaving(false);
          return;
        }
      }

      // 出欠一覧の初期表示は設定画面で本人が選ぶ項目なので、ここでは触らない。
      // ブロックを変えたときだけ、新しいブロックに合わせた初期値を入れ直す。
      const previousPrimaryBlock = profile.blocks[0];
      const blockChanged = selectedBlock !== previousPrimaryBlock;
      const attendanceDefaults = blockChanged
        ? {
            attendance_default_block: selectedBlock === "manager" ? "all" : selectedBlock,
            attendance_view_all_blocks: selectedBlock === "manager",
          }
        : {};

      const result = await safeUpdate(
        createClient(),
        "profiles",
        {
          display_name: name.trim(),
          blocks: normalizeProfileBlocks(blocks),
          ...attendanceDefaults,
          events: events.filter((ev) => eventOptions.includes(ev)),
          grade,
          ...(!separateRecordSettings ? { sheet_name: sheetName.trim() || null,
          sheet_header_signature: headerSignature,
          record_source: nextRecordSource,
          record_fields: recordFieldsToJson(recordFields) } : {}),
        },
        { id: profile.id },
      );

      if (!result.ok) {
        setError(safeUpdateMessage(result.reason));
        setSaving(false);
        return;
      }
      setHeaderData(null);
      setSaving(false);
      router.refresh();
      onDone();
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally { setSaving(false); }
  }

  return (
    <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
      {isSetup && (
        <p className="text-body text-muted">はじめまして！プロフィールを設定しましょう。</p>
      )}

      <div>
        <p className="section-label mb-1.5">名前</p>
        <Input
          placeholder="例: 山田 太郎"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />
      </div>

      <div>
        <p className="section-label mb-1.5">アイコン（任意）</p>
        <div className="flex items-center gap-3">
          <Avatar
            name={name || "?"}
            blocks={blocks}
            avatarUrl={avatarUrl.trim() || null}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(event) => void selectAvatar(event.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || processingAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Camera size={16} />
                {processingAvatar ? "画像を保存中…" : "写真を選ぶ"}
              </Button>
              {avatarUrl.trim() && (
                <Button data-ui-tone="danger"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  disabled={saving || processingAvatar}
                  onClick={() => void removeAvatar()}
                >
                  <Trash2 size={16} />
                  削除
                </Button>
              )}
            </div>
            <p className="mt-1 text-micro">
              写真の位置と大きさを調整できます。確定すると画像だけすぐに保存されます。
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-1.5">所属ブロック</p>
        <div className="grid grid-cols-2 gap-2">
          {PROFILE_BLOCK_ORDER.map((b) => {
            const meta = BLOCKS[b];
            const active = blocks.includes(b);
            return (
              <button
                data-ui-choice
                aria-pressed={active}
                key={b}
                type="button"
                onClick={() => selectBlock(b)}
                className="h-11 rounded-xl border text-[14px] font-semibold pressable"
                style={{
                  borderColor: active ? meta.color : "#e5e5ea",
                  backgroundColor: active ? meta.bg : "#fff",
                  color: active ? meta.color : "#8e8e93",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {eventOptions.length > 0 && (
        <div>
          <p className="section-label mb-1.5">専門種目（任意・複数可）</p>
          <div className="space-y-3">
            {eventGroups.map((block) => {
              const selected = EVENTS_BY_BLOCK[block].filter((event) => events.includes(event));
              const summary = selected.length > 0 ? selected.join("・") : "未選択";
              return <Disclosure key={block} title={<>
                <span className="flex items-center gap-2">
                  <span>{BLOCKS[block].label}</span>
                  <span className="min-w-14 text-micro font-normal tabular-nums">{selected.length}件選択</span>
                </span>
                <span className="block truncate text-micro font-normal" title={summary}>{summary}</span>
              </>}>
              <fieldset className="min-w-0">
                <legend className="sr-only">{BLOCKS[block].label}の専門種目</legend>
                <div className="flex flex-wrap gap-2">
                  {EVENTS_BY_BLOCK[block].map((event) => {
                    const active = events.includes(event);
                    return (
                      <button
                        data-ui-choice
                        aria-pressed={active}
                        key={event}
                        type="button"
                        onClick={() => toggleEvent(event)}
                        className={cn(
                          "min-h-11 rounded-full border px-3.5 text-[13px] font-semibold pressable",
                          active
                            ? "border-accent bg-accent text-white"
                            : "border-separator bg-card text-muted",
                        )}
                      >
                        {event}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              </Disclosure>;
            })}
          </div>
        </div>
      )}

      <div>
        <p className="section-label mb-1.5">学年</p>
        <div className="grid grid-cols-4 gap-2">
          {GRADE_OPTIONS.map((g) => {
            const active = grade === g.value;
            return (
              <button
                data-ui-choice
                aria-pressed={active}
                key={g.value}
                type="button"
                onClick={() => setGrade(g.value)}
                className={cn(
                  "h-11 rounded-xl border text-[14px] font-semibold pressable",
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-separator bg-card text-muted",
                )}
              >
                {g.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* スプレッドシート連携：自分のシートを選ぶ（練習記録の同期に使う）。
          候補取得中も欄自体は出しておき、後から急に現れる遅延を無くす。 */}
      {!separateRecordSettings && (sheetOptions === null || sheetOptions.length > 0) && (
        <div>
          <p className="section-label mb-1.5">スプレッドシートの自分のシート（任意）</p>
          {sheetOptions === null ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <select
              data-ui-field
              aria-label="スプレッドシートの自分のシート"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="h-11 w-full rounded-xl border border-separator bg-card px-3 text-[16px] text-ink"
            >
              <option value="">（連携しない）</option>
              {sheetOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          <p className="text-micro mt-1">
            {enableSheetHeaderSetup
              ? "選ぶと、アプリで保存した記録はすぐに書き込み、スプレッドシートで入力した記録は毎日0時に読み込みます。"
              : "選ぶと、アプリの記録はすぐに書き込み、スプレッドシートの記録は毎日0時に読み込みます。"}
          </p>
          {enableSheetHeaderSetup && sheetName.trim() && (
            <button
              data-ui-row
              type="button"
              onClick={() => void openHeaderEditor()}
              disabled={loadingHeader || saving}
              className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-separator bg-card px-3 text-left active:bg-bg disabled:opacity-60"
            >
              <SlidersHorizontal size={18} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">入力フォーム・タイムライン表示項目</span>
                <span className="block text-micro text-muted">
                  {loadingHeader ? "見出しを取得中…" : "自分のシートの列から変更"}
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      {!separateRecordSettings && sheetNameMissing && (
        <p className="-mt-3 text-micro text-danger">現在選ばれているシートが見つかりません。正しいシートを選び直してください。</p>
      )}

      {!separateRecordSettings && enableSheetHeaderSetup && sheetName.trim() && (
        <p className="text-micro -mt-3">
          列名が変わったときは、連携前にアプリで入力項目を再確認します。
        </p>
      )}

      {error && <p className="text-caption text-danger text-center">{error}</p>}
      <FormModalFooter>
        <Button size="lg" onClick={save} disabled={saving || processingAvatar || !valid}>
          {saving ? "保存中…" : isSetup ? "はじめる" : "保存する"}
        </Button>
      </FormModalFooter>

      {!isSetup && (
        <button
          data-ui-action
          data-ui-tone="danger"
          type="button"
          onClick={() => setConfirmSignOut(true)}
          disabled={signingOut}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-separator text-[15px] font-semibold text-danger active:bg-bg"
        >
          <LogOut size={18} />
          ログアウト
        </button>
      )}

      {enableSheetHeaderSetup && headerData && <SheetHeaderSetupDialog
        key={headerData.signature}
        open
        data={headerData}
        initialFields={profile.record_fields}
        isMiddleLong={blocks.includes("middle_long")}
        busy={saving}
        onCancel={() => setHeaderData(null)}
        onConfirm={(fields, signature) => {
          void persistProfile(fields, signature);
        }}
      />}

      <AvatarCropEditor
        file={avatarCropFile}
        open={Boolean(avatarCropFile)}
        onOpenChange={(next) => {
          if (!next) setAvatarCropFile(null);
        }}
        onApply={uploadCroppedAvatar}
      />

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="ログアウトしますか？"
        description="次に使うときは再度ログインが必要になります。"
        confirmLabel="ログアウト"
        busyLabel="ログアウト中…"
        busy={signingOut}
        onConfirm={signOut}
      />
    </fieldset>
  );
}
