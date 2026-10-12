"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { FormModal, FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ReorderList } from "@/components/ui/reorder-list";
import { useToast } from "@/components/ui/toast";
import { Linkify } from "@/components/common/Linkify";
import { safeUpdate, safeUpdateMessage } from "@/lib/safe-update";
import type { VenueRow } from "@/types";
import type { Database } from "@/types/database";

/** 練習場所の管理（追加・編集・削除・選択リスト表示の切替） */
export function VenueManager({ initial }: { initial: VenueRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<VenueRow[]>(initial);
  const [editing, setEditing] = useState<VenueRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  async function togglePinned(v: VenueRow) {
    const previous = items;
    setItems((arr) => arr.map((x) => (x.id === v.id ? { ...x, pinned: !x.pinned } : x)));
    const supabase = createClient();
    const result = await safeUpdate(
      supabase,
      "venues",
      { pinned: !v.pinned },
      { id: v.id },
    );
    if (!result.ok) {
      setItems(previous);
      showToast(safeUpdateMessage(result.reason));
      return;
    }
    router.refresh();
  }

  async function remove(v: VenueRow) {
    try {
      const { data, error } = await createClient().from("venues").delete().eq("id", v.id).select("id");
      if (error || !data || data.length !== 1) {
        showToast("会場を削除できませんでした");
        return false;
      }
      setItems((arr) => arr.filter((x) => x.id !== v.id));
      router.refresh();
      return true;
    } catch {
      showToast("会場を削除できませんでした");
      return false;
    }
  }

  async function reorder(next: VenueRow[]) {
    const previous = items;
    setItems(next);
    const supabase = createClient();
    const { error } = await supabase.rpc("reorder_venues", {
      venue_ids: next.map((venue) => venue.id),
    });
    if (error) {
      setItems(previous);
      showToast("並び順を更新できませんでした");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <p className="text-caption">
        オンにした会場が、予定作成の「場所」リストに表示されます。
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant={reorderMode ? "primary" : "outline"}
          onClick={() => setReorderMode((value) => !value)}
        >
          <SlidersHorizontal size={16} />
          {reorderMode ? "完了" : "並べ替え"}
        </Button>
      </div>

      <ReorderList
        items={items}
        enabled={reorderMode}
        onReorder={(next) => void reorder(next)}
        renderItem={(v) => (
          <Card key={v.id} className="p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {v.short && (
                  <p className="mb-1">
                    <span className="inline-flex rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">
                      {v.short}
                    </span>
                  </p>
                )}
                <p className="text-headline break-words">{v.name}</p>
                {v.access && (
                  <div className="text-caption whitespace-pre-wrap mt-0.5">
                    <Linkify text={v.access} />
                  </div>
                )}
                {v.fee && <p className="text-caption">参加費：{v.fee}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-3">
                <ActionMenu
                  onEdit={() => setEditing(v)}
                  onDelete={() => remove(v)}
                  deleteTitle={`「${v.name}」を削除しますか？`}
                  deleteDescription="削除した会場は予定作成の候補からも消えます。"
                  triggerLabel={`${v.name}のメニュー`}
                />
              </div>
            </div>
            <Toggle
              label="予定作成に表示"
              checked={v.pinned}
              onChange={() => togglePinned(v)}
              className="mt-3 border-0 bg-transparent p-0"
            />
          </Card>
        )}
      />

      <Button variant="outline" size="lg" onClick={() => setCreating(true)} className="gap-2">
        <Plus size={18} /> 会場を追加
      </Button>

      {creating && (
        <FormModal open onOpenChange={setCreating} title="会場を追加">
          <VenueForm
            sort={items.length + 1}
            onSaved={(v) => {
              setItems((arr) => [...arr, v]);
              setCreating(false);
            }}
          />
        </FormModal>
      )}

      {editing && (
        <FormModal open onOpenChange={(open) => !open && setEditing(null)} title="会場を編集">
          <VenueForm
            venue={editing}
            sort={editing.sort}
            onSaved={(v) => {
              setItems((arr) => arr.map((x) => (x.id === v.id ? v : x)));
              setEditing(null);
            }}
          />
        </FormModal>
      )}
    </>
  );
}

function VenueForm({
  venue,
  sort,
  onSaved,
}: {
  venue?: VenueRow;
  sort: number;
  onSaved: (v: VenueRow) => void;
}) {
  const [name, setName] = useState(venue?.name ?? "");
  const [short, setShort] = useState(venue?.short ?? "");
  const [access, setAccess] = useState(venue?.access ?? "");
  const [fee, setFee] = useState(venue?.fee ?? "");
  const [url, setUrl] = useState(venue?.url ?? "");
  const [pinned, setPinned] = useState(venue?.pinned ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<Database["public"]["Tables"]["venues"]["Insert"] | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);

  useFormDraft({
    dirty: !!unconfirmed || JSON.stringify([name, short, access, fee, url, pinned]) !== JSON.stringify([venue?.name ?? "", venue?.short ?? "", venue?.access ?? "", venue?.fee ?? "", venue?.url ?? "", venue?.pinned ?? true]),
    busy: saving, intent: unconfirmed ? "check" : undefined, onSave: unconfirmed ? checkSave : submit,
  });
  async function checkSave() {
    if (saving || !unconfirmed) return;
    setSaving(true);
    setRetryAllowed(false);
    try {
      const { data, error: readError } = await createClient().from("venues").select().eq("id", unconfirmed.id!).maybeSingle();
      if (!readError && data && Object.entries(unconfirmed).every(([key, value]) => data[key as keyof VenueRow] === value)) {
        onSaved(data);
        return;
      }
      if (!readError && (!data ? !venue : !!venue && Object.keys(unconfirmed).every(key => data[key as keyof VenueRow] === venue[key as keyof VenueRow]))) {
        setRetryAllowed(true);
        setError("保存結果を確認できませんでした。同じ内容で保存を試すこともできます");
        return;
      }
      setError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
    } catch {
      setError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
    } finally { setSaving(false); }
  }
  async function retrySave() {
    if (saving || !retryAllowed || !unconfirmed) return;
    setSaving(true);
    setRetryAllowed(false);
    try {
      const supabase = createClient();
      let query = venue ? supabase.from("venues").update(unconfirmed).eq("id", venue.id) : supabase.from("venues").insert(unconfirmed);
      if (venue) {
        for (const key of Object.keys(unconfirmed)) { const value = venue[key as keyof VenueRow]; query = value === null ? query.is(key, null) : query.eq(key, value); }
      }
      const { data, error: saveError } = await query.select().single();
      if (saveError || !data) {
        setError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
        return;
      }
      onSaved(data);
    } catch {
      setError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
    } finally { setSaving(false); }
  }
  async function submit() {
    if (saving || unconfirmed) return;
    let submitted: Database["public"]["Tables"]["venues"]["Insert"] | null = null;
    try {
      if (!name.trim()) {
        setError("会場名を入力してください");
        return;
      }
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const payload = {
        id: venue?.id ?? crypto.randomUUID(),
        name: name.trim(),
        short: short.trim() || null,
        access: access.trim() || null,
        fee: fee.trim() || null,
        url: url.trim() || null,
        pinned,
        sort,
      };
      submitted = payload;
      const { data, error } = venue
        ? await supabase.from("venues").update(payload).eq("id", venue.id).select().single()
        : await supabase.from("venues").insert(payload).select().single();

      if (error || !data) {
        if (!error?.code) {
          setUnconfirmed(payload);
          setError("保存できたか確認できませんでした。保存結果を確認してください");
        } else setError("保存できませんでした。もう一度お試しください");
        return;
      }
      onSaved(data as VenueRow);
    } catch {
      if (submitted) {
        setUnconfirmed(submitted);
        setError("保存できたか確認できませんでした。保存結果を確認してください");
      } else setError("保存できませんでした。もう一度お試しください");
    } finally { setSaving(false); }
  }

  return (
    <fieldset disabled={saving || !!unconfirmed} className="min-w-0 space-y-4 pb-4">
      <div>
        <label htmlFor="venue-name" className="section-label mb-1.5 block">会場名</label>
        <Input placeholder="例: 府中市民陸上競技場" id="venue-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="venue-short" className="section-label mb-1.5 block">略称（任意・カードに表示）</label>
        <Input placeholder="例: 府中" id="venue-short" value={short} onChange={(e) => setShort(e.target.value)} maxLength={6} />
      </div>
      <div>
        <label htmlFor="venue-access" className="section-label mb-1.5 block">アクセス（任意・改行で複数）</label>
        <Textarea rows={3} placeholder={"例: 北府中駅から徒歩7分\n府中駅から徒歩15分"} id="venue-access" value={access} onChange={(e) => setAccess(e.target.value)} />
      </div>
      <div>
        <label htmlFor="venue-fee" className="section-label mb-1.5 block">参加費（任意）</label>
        <Input placeholder="例: 100円" id="venue-fee" value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <div>
        <label htmlFor="venue-url" className="section-label mb-1.5 block">地図URL（任意）</label>
        <Input placeholder="https://maps…" id="venue-url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
      </div>
      <Toggle label="予定作成に表示" checked={pinned} onChange={() => setPinned((v) => !v)} />
      {error && <p className="text-caption text-danger text-center">{error}</p>}
      <FormModalFooter>
        {unconfirmed
          ? <div className="space-y-2"><Button size="lg" onClick={() => void checkSave()} disabled={saving}>保存結果を確認</Button>{retryAllowed && <Button size="lg" disabled={saving} onClick={() => void retrySave()}>同じ内容で保存する</Button>}</div>
          : <Button size="lg" onClick={submit} disabled={saving} className="gap-1">
              <MapPin size={16} /> {saving ? "保存中…" : venue ? "更新する" : "追加する"}
            </Button>}
      </FormModalFooter>
    </fieldset>
  );
}
