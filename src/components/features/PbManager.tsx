"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormModal } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { ResultsList } from "@/components/features/ResultsList";
import { ResultForm } from "@/components/post/ResultForm";
import { FloatingActionPosition, floatingActionButtonClass } from "@/components/ui/floating-action";
import type { CompetitionEvent } from "@/lib/competition-goals";
import type { CompetitionRow, PbRecord } from "@/types";

export function PbManager({
  userId,
  initial,
  events,
  competitions,
  addLabel = "結果を追加",
}: {
  /** 結果の持ち主。システム管理者が他の部員の結果を直すときは本人以外になる */
  userId: string;
  initial: PbRecord[];
  events: CompetitionEvent[];
  competitions: CompetitionRow[];
  addLabel?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<PbRecord[]>(initial);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PbRecord | null>(null);

  function openAdd() {
    setEditTarget(null);
    setOpen(true);
  }
  function openEdit(pb: PbRecord) {
    setEditTarget(pb);
    setOpen(true);
  }

  async function remove(id: string) {
    try {
      const { data, error } = await createClient().from("pb_records").delete().eq("id", id).select("id");
      if (error || !data || data.length !== 1) {
        showToast("結果を削除できませんでした");
        return false;
      }
      setItems((arr) => arr.filter((x) => x.id !== id));
      router.refresh();
      return true;
    } catch {
      showToast("結果を削除できませんでした");
      return false;
    }
  }

  const addButton = (
    <button
      data-ui-action="icon"
      type="button"
      onClick={openAdd}
      aria-label={addLabel}
      className={floatingActionButtonClass}
    >
      <Plus size={26} />
    </button>
  );

  return (
    <>
      <div className="space-y-3">
        <ResultsList results={items} events={events} onEdit={openEdit} onDelete={remove} />
      </div>

      {/* 追加は他の画面と同じくFABから。一覧の下にボタンを置かない（規約: 書く=FAB） */}
      {<FloatingActionPosition>{addButton}</FloatingActionPosition>}

      {open && (
        <FormModal
          open
          onOpenChange={setOpen}
          intent={editTarget ? "update" : "post"}
          title={editTarget ? "大会・記録会の結果を編集" : "大会・記録会の結果"}
        >
          <ResultForm
            key={editTarget?.id ?? "new"}
            userId={userId}
            events={events}
            competitions={competitions}
            initial={editTarget ?? undefined}
            onDone={(saved) => {
              if (saved) {
                setItems((arr) =>
                  editTarget
                    ? arr.map((x) => (x.id === saved.id ? saved : x))
                    : [saved, ...arr],
                );
              }
              setOpen(false);
            }}
          />
        </FormModal>
      )}
    </>
  );
}
