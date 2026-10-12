"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { glassDialogOpener } from "@/components/layout/glass/glass-press";

export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  if (!open || typeof document === "undefined") return null;
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/95" />
      <Dialog.Content data-new-ui-surface aria-describedby={undefined}
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 pt-[max(12px,env(safe-area-inset-top))] outline-none"
        onOpenAutoFocus={() => { opener.current = glassDialogOpener(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); }}
        onClick={onClose}>
        <Dialog.Title className="sr-only">画像を拡大表示</Dialog.Title>
        <Dialog.Close aria-label="閉じる" onClick={(event) => event.stopPropagation()} className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-white/15 text-white focus-visible:outline-2 focus-visible:outline-white">
          <X size={24} aria-hidden="true" />
        </Dialog.Close>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-full max-w-full select-none object-contain" onClick={(event) => event.stopPropagation()} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
