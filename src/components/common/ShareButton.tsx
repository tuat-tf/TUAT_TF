"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { GlassMenu } from "@/components/ui/glass-menu";

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed");
}

/** Existing share operations can also live inside a content's ActionMenu. */
export function useShareActions({
  title,
  text,
  path,
  onClose,
}: {
  title: string;
  text?: string;
  path: string;
  onClose?: () => void;
}) {
  const { showToast } = useToast();

  async function copyLink() {
    const url = new URL(path, window.location.origin).toString();
    try {
      await copyText(url);
      onClose?.();
      showToast("リンクをコピーしました", "success");
    } catch {
      showToast("リンクをコピーできませんでした");
    }
  }

  async function shareExternally() {
    const url = new URL(path, window.location.origin).toString();

    if (navigator.share) {
      onClose?.();
      try {
        await navigator.share({
          title,
          text: [text, url].filter(Boolean).join("\n"),
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyLink();
  }

  return { copyLink, shareExternally };
}

export function ShareButton({
  title,
  text,
  path,
  label = "\u5171\u6709\u3059\u308b",
  className,
}: {
  title: string;
  text?: string;
  path: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { copyLink, shareExternally } = useShareActions({ title, text, path, onClose: () => setOpen(false) });

  const trigger = (
      <button
        data-ui-action="icon"
        type="button"
        onClick={undefined}
        aria-label={label}
        title={label}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center text-muted pressable",
          className,
        )}
      >
        <Share2 size={19} />
      </button>
  );

  return (
    <>
      <GlassMenu open={open} onOpenChange={setOpen} label="共有" trigger={trigger} items={[
        { key: "copy", label: "リンクをコピー", icon: <Copy size={20} />, immediate: true, onSelect: () => void copyLink() },
        { key: "share", label: "ほかのアプリで共有", icon: <Share2 size={20} />, immediate: true, onSelect: () => void shareExternally() },
      ]} />

    </>
  );
}
