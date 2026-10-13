"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { Input } from "@/components/ui/input";
import { ReorderList } from "@/components/ui/reorder-list";
import { SegmentedControl } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { formatRecordedOn } from "@/lib/competition-record";
import { isCompetitionArchived, selectHomeCompetition } from "@/lib/competition-lifecycle";
import { saveCompetitionOrder } from "@/lib/competition-order";
import { atomicSave, atomicSaveMessage } from "@/lib/atomic-save";
import type { CompetitionRow } from "@/types";

/**
 * 部で統一している大会（対抗戦など）の一覧。
 * システム管理者だけが追加・編集・削除でき、結果の入力と目標はここで作った大会から選ぶ。
 */
export function CompetitionManager({
  initial,
  canManage,
  initialNow,
}: {
  initial: CompetitionRow[];
  canManage: boolean;
  initialNow: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState(initial);
  const [receivedInitial, setReceivedInitial] = useState(initial);
  if (receivedInitial !== initial) { setReceivedInitial(initial); setItems(initial); }
  const [editing, setEditing] = useState<CompetitionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [savingCountdown, setSavingCountdown] = useState(false);
  const [unconfirmedCountdown, setUnconfirmedCountdown] = useState(false);
  const countdownAttempt = useRef<{ desiredId: string | null; expectedId: string | null } | null>(null);
  const countdownSaveState = useRef({ uncertain: false });
  const [archiveTab, setArchiveTab] = useState(false);
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const homeId = selectHomeCompetition(items, now)?.id;
  const visibleItems = reorderMode
    ? items
    : items
        .filter((c) => isCompetitionArchived(c, now) === archiveTab)
        // アーカイブは終わった日が新しい大会を上に（並べ替えは開催前の大会だけで使う）
        .sort((a, b) => (archiveTab ? (b.ends_on ?? b.starts_on).localeCompare(a.ends_on ?? a.starts_on) : 0));

  /** その場でアーカイブする／解除する（日時の入力は不要。押した時刻でアーカイブになる） */
  async function toggleArchive(target: CompetitionRow) {
    const previous = items;
    // 画面が持つ現在時刻（30秒ごとに更新）で付ける。押した直後からアーカイブとして表示される。
    const archiveAt = isCompetitionArchived(target, now) ? null : new Date(now).toISOString();
    setItems((old) => old.map((c) => (c.id === target.id ? { ...c, archive_at: archiveAt } : c)));
    const { error } = await createClient()
      .from("competitions")
      .update({ archive_at: archiveAt })
      .eq("id", target.id)
      .select("id")
      .single();
    if (error) {
      setItems(previous);
      showToast(archiveAt ? "アーカイブできませんでした" : "アーカイブを解除できませんでした");
      return;
    }
    showToast(archiveAt ? `「${target.name}」をアーカイブしました` : `「${target.name}」をアーカイブから戻しました`, "success");
    router.refresh();
  }

  /** ドラッグした順に 10 刻みで振り直す（数字を手で入れなくてよいように） */
  async function reorder(next: CompetitionRow[]) {
    if (reordering) return;
    setReordering(true);
    const renumbered = next.map((c, index) => ({
      ...c,
      sort_order: (index + 1) * 10,
    }));
    setItems(renumbered);
    const saved = await saveCompetitionOrder(createClient(), "competitions", next.map((row) => row.id));
    setReordering(false);
    if (!saved) showToast("一部の並び順を保存できませんでした。更新後の一覧を確認してください");
    router.refresh();
  }

  async function setCountdown(target?: CompetitionRow) {
    if (savingCountdown) return;
    if (!countdownAttempt.current && target) {
      countdownAttempt.current = {
        desiredId: target.is_countdown ? null : target.id,
        expectedId: items.find((row) => row.is_countdown)?.id ?? null,
      };
    }
    if (!countdownAttempt.current) return;
    setSavingCountdown(true);
    try {
      const { desiredId, expectedId } = countdownAttempt.current;
      const supabase = createClient();
      const result = await atomicSave(countdownSaveState.current, async () => {
        const response = await supabase.rpc("set_competition_countdown", { p_target_id: desiredId, p_expected_id: expectedId });
        const data = response.data && typeof response.data === "object" && !Array.isArray(response.data) && response.data.countdown_id === desiredId ? true : null;
        return { data, error: response.error };
      }, async () => {
        const { data, error } = await supabase.from("competitions").select("id").eq("is_countdown", true);
        if (error || !data || data.length > 1 || (data[0]?.id ?? null) !== desiredId) return null;
        return true;
      });
      if (!result.ok) {
        setUnconfirmedCountdown(result.reason === "unknown");
        if (result.reason !== "unknown") countdownAttempt.current = null;
        showToast(atomicSaveMessage(result.reason));
        if (result.reason === "conflict") router.refresh();
        return;
      }
      setItems((old) => old.map((row) => ({ ...row, is_countdown: row.id === desiredId })));
      setUnconfirmedCountdown(false);
      countdownAttempt.current = null;
      router.refresh();
    } finally {
      setSavingCountdown(false);
    }
  }

  async function remove(target: CompetitionRow) {
    try {
      const { data, error } = await createClient()
        .from("competitions")
        .delete()
        .eq("id", target.id)
        .select("id");
      if (error || !data || data.length !== 1) {
        showToast("大会を削除できませんでした。目標が登録されていないか確認してください");
        return false;
      }
      setItems((old) => old.filter((c) => c.id !== target.id));
      router.refresh();
      return true;
    } catch {
      showToast("大会を削除できませんでした。目標が登録されていないか確認してください");
      return false;
    }
  }

  return (
    <>
      <p className="text-caption">
        ここに登録した大会は、結果の入力で日付ごと選べるようになり、大会ごとの目標と結果をまとめて見られます。記録会などは結果の入力で自由に大会名を書けます。
      </p>
      {unconfirmedCountdown && (
        <Button disabled={savingCountdown} onClick={() => setCountdown()}>
          保存結果を確認
        </Button>
      )}

      {items.length === 0 && (
        <Card className="p-4">
          <p className="text-caption">まだ大会はありません</p>
        </Card>
      )}

      {canManage && items.length > 1 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant={reorderMode ? "primary" : "outline"}
            disabled={reordering}
            onClick={() => setReorderMode((value) => !value)}
          >
            <SlidersHorizontal size={16} />
            {reorderMode ? "完了" : "並べ替え"}
          </Button>
        </div>
      )}

      {!reorderMode && (
        <SegmentedControl
          items={[{ key: "current", label: "大会" }, { key: "archive", label: "アーカイブ" }]}
          value={archiveTab ? "archive" : "current"}
          onChange={(key) => setArchiveTab(key === "archive")}
        />
      )}
      {visibleItems.length === 0 && items.length > 0 && <p className="text-caption">{archiveTab ? "まだアーカイブはありません" : "表示する大会はありません"}</p>}
      <ReorderList
        items={visibleItems}
        enabled={canManage && reorderMode && !reordering}
        onReorder={(next) => void reorder(next)}
        renderItem={(c) => (
          <Card key={c.id} className="p-3">
            <div className="flex items-start gap-2">
              <Link
                data-ui-row
                href={`/competitions/${c.id}`}
                className="flex-1 min-w-0 pressable"
              >
                <p className="text-headline break-words">
                  {c.name}
                  {c.id === homeId && (
                    <span className="ml-1.5 rounded border border-accent px-1 text-[10px] font-bold text-accent">
                      ホーム
                    </span>
                  )}
                </p>
                {isCompetitionArchived(c, now) && <p className="text-caption">アーカイブ・プログラムと目標を確認できます</p>}
                {c.archive_at && !isCompetitionArchived(c, now) && <p className="text-caption">{new Date(c.archive_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}にアーカイブ</p>}
                <p className="text-caption">
                  {formatRecordedOn(c.starts_on, "day")}
                  {c.ends_on && c.ends_on !== c.starts_on
                    ? ` 〜 ${formatRecordedOn(c.ends_on, "day")}`
                    : ""}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <ChevronRight size={16} className="text-muted" />
                {canManage && !reorderMode && (
                  <ActionMenu
                    onEdit={() => setEditing(c)}
                    onArchive={() => toggleArchive(c)}
                    archived={isCompetitionArchived(c, now)}
                    onDelete={() => remove(c)}
                    deleteTitle={`「${c.name}」を削除しますか？`}
                    deleteDescription="この大会に登録された目標も消えます。結果の大会の紐付けは外れますが、結果自体は残ります。"
                    triggerLabel={`${c.name}のメニュー`}
                  />
                )}
              </div>
            </div>
            {canManage && !reorderMode && !isCompetitionArchived(c, now) && (
              <Toggle
                label="ホームのカウントダウンに出す"
                checked={c.is_countdown}
                disabled={savingCountdown || unconfirmedCountdown}
                onChange={() => setCountdown(c)}
                className="mt-3 border-0 bg-transparent p-0"
              />
            )}
          </Card>
        )}
      />

      {canManage && (
        <Button
          variant="outline"
          size="lg"
          onClick={() => setCreating(true)}
          className="gap-2"
        >
          <Plus size={18} /> 大会を追加
        </Button>
      )}

      {creating && (
        <FormModal open onOpenChange={setCreating} title="大会を追加">
          <CompetitionForm
            sortOrder={Math.max(0, ...items.map((c) => c.sort_order)) + 10}
            onSaved={(c) => {
              setItems((old) => [...old, c]);
              setCreating(false);
              router.refresh();
            }}
          />
        </FormModal>
      )}

      {editing && (
        <FormModal
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title="大会を編集"
        >
          <CompetitionForm
            competition={editing}
            sortOrder={editing.sort_order}
            onSaved={(c) => {
              setItems((old) => old.map((x) => (x.id === c.id ? c : x)));
              setEditing(null);
              router.refresh();
            }}
          />
        </FormModal>
      )}
    </>
  );
}

function CompetitionForm({
  competition,
  sortOrder,
  onSaved,
}: {
  competition?: CompetitionRow;
  sortOrder: number;
  onSaved: (c: CompetitionRow) => void;
}) {
  const [name, setName] = useState(competition?.name ?? "");
  const [startsOn, setStartsOn] = useState(competition?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(competition?.ends_on ?? "");
  const [programSourceUrl, setProgramSourceUrl] = useState(competition?.program_source_url ?? "");
  const sort = sortOrder;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify([name, startsOn, endsOn, programSourceUrl]) !== JSON.stringify([
    competition?.name ?? "", competition?.starts_on ?? "", competition?.ends_on ?? "", competition?.program_source_url ?? "",
  ]);

  async function submit() {
    if (saving) return;
    if (!name.trim() || !startsOn) {
      setError("大会名と初日を入力してください");
      return;
    }
    if (endsOn && endsOn < startsOn) {
      setError("最終日は初日より後にしてください");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      name: name.trim(),
      starts_on: startsOn,
      ends_on: endsOn || null,
      program_source_url: programSourceUrl.trim() || null,
    };
    try {
    const { data, error: saveError } = competition
      ? await supabase
          .from("competitions")
          .update(payload)
          .eq("id", competition.id)
          .select()
          .single()
      : await supabase
          .from("competitions")
          .insert({ id: crypto.randomUUID(), sort_order: Number.isInteger(sort) && sort >= 0 ? sort : 0, ...payload })
          .select()
          .single();
    if (saveError || !data) {
      setError("保存できませんでした。もう一度お試しください");
      setSaving(false);
      return;
    }
    onSaved(data as CompetitionRow);
    } catch {
      setError("保存結果を確認できませんでした。入力を残して、画面を開き直して確認してください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
      <FormDraftGuard dirty={dirty} busy={saving} onSave={submit} />
      <div>
        <p className="section-label mb-1.5">大会名</p>
        <Input
          placeholder="例: 27大戦"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <p className="section-label mb-1.5">初日</p>
        <Input
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
      </div>
      <div>
        <p className="section-label mb-1.5">最終日（任意・複数日開催のとき）</p>
        <Input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
        />
      </div>
      <div>
        <p className="section-label mb-1.5">プログラムの取得元URL（任意）</p>
        <Input
          type="url"
          placeholder="速報サイトのタイムテーブルURL"
          value={programSourceUrl}
          onChange={(e) => setProgramSourceUrl(e.target.value)}
        />
        <p className="mt-1 text-micro text-muted">
          設定すると、農工大の出場種目・出場選手を定期的に自動で取り込み、ホームにプログラムのカードが出ます。
        </p>
      </div>
      {error && <p className="text-caption text-danger text-center">{error}</p>}
      <FormModalFooter>
        <Button size="lg" onClick={submit} disabled={saving} className="gap-1">
          <CalendarDays size={16} />
          {saving ? "保存中…" : competition ? "更新する" : "追加する"}
        </Button>
      </FormModalFooter>
    </fieldset>
  );
}
