"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Quote, Share2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { GlassMenu, type GlassMenuItem } from "./glass-menu";

export function ActionMenu({
  onEdit,
  onQuote,
  onShare,
  onPin,
  onArchive,
  archived = false,
  pinned = false,
  onDelete,
  editLabel = "編集する",
  quoteLabel = "投稿を引用",
  shareLabel = "共有リンクをコピー",
  deleteLabel = "削除する",
  deleteTitle = "削除しますか？",
  deleteDescription = "削除した内容は元に戻せません。",
  deleteConfirmLabel,
  deleteStatus,
  disabled = false,
  triggerLabel = "操作メニュー",
  className,
}: {
  onEdit?: () => void;
  onQuote?: () => void;
  onShare?: () => void | Promise<void>;
  onDelete?: () => void | boolean | Promise<void | boolean>;
  onPin?: () => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
  archived?: boolean;
  pinned?: boolean;
  editLabel?: string;
  quoteLabel?: string;
  shareLabel?: string;
  deleteLabel?: string;
  deleteTitle?: string;
  deleteDescription?: string;
  deleteConfirmLabel?: string;
  deleteStatus?: string;
  disabled?: boolean;
  triggerLabel?: string;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const glassItems: GlassMenuItem[] = [];
  if (onEdit) glassItems.push({ key: "edit", label: editLabel, icon: <Pencil size={21} />, onSelect: onEdit });
  if (onQuote) glassItems.push({ key: "quote", label: quoteLabel, icon: <Quote size={21} />, onSelect: onQuote });
  if (onShare) glassItems.push({ key: "share", label: shareLabel, icon: <Share2 size={21} />, immediate: true, onSelect: () => { void onShare(); } });
  if (onPin) glassItems.push({ key: "pin", label: pinned ? "ピン留めを外す" : "ピン留めする", icon: pinned ? <PinOff size={21} /> : <Pin size={21} />, onSelect: () => { void onPin(); } });
  if (onArchive) glassItems.push({ key: "archive", label: archived ? "アーカイブを解除" : "アーカイブする", description: archived ? "ホームの表示対象に戻します" : "全員のホームから非表示にします", icon: archived ? <ArchiveRestore size={21} /> : <Archive size={21} />, onSelect: () => { void onArchive(); } });
  if (onDelete) glassItems.push({ key: "delete", label: deleteLabel, icon: <Trash2 size={21} />, destructive: true, separator: glassItems.length > 0, onSelect: () => setConfirmOpen(true) });

  async function remove() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      const deleted = await onDelete();
      if (deleted !== false) setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const trigger = <button
        type="button"
        disabled={disabled}
        data-glass-control
        aria-label={triggerLabel}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center text-muted pressable",
          className,
        )}
      >
        <MoreHorizontal size={20} />
      </button>;
  return (
    <>
      <GlassMenu open={menuOpen} onOpenChange={setMenuOpen} label={triggerLabel} trigger={trigger} items={glassItems} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={deleteTitle}
        description={deleteStatus ? `${deleteDescription}\n${deleteStatus}` : deleteDescription}
        confirmLabel={deleteConfirmLabel ?? deleteLabel}
        busy={deleting}
        onConfirm={remove}
      />
    </>
  );
}
