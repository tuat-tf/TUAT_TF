"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Avatar writes save independently; refresh reconciles response loss without rewriting the profile. */
export function useProfileAvatar(profileAvatarUrl: string | null, setError: (message: string | null) => void) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(profileAvatarUrl ?? "");
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Reconciliation/router.refresh can reveal a save whose response was lost.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarUrl(profileAvatarUrl ?? "");
  }, [profileAvatarUrl]);

  function selectAvatar(file: File | undefined) {
    if (!file) return;
    setError(null);
    setAvatarCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function uploadCroppedAvatar(prepared: Blob) {
    setProcessingAvatar(true);
    setError(null);
    try {
      const response = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": prepared.type },
        body: prepared,
      }).catch(() => { throw new Error("画像の保存結果を確認できませんでした。画面を開き直して確認してください"); });
      const result = (await response.json().catch(() => { throw new Error("画像の保存結果を確認できませんでした。画面を開き直して確認してください"); })) as {
        avatarUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.avatarUrl) {
        throw new Error(result.error ?? "画像の保存結果を確認できませんでした。画面を開き直して確認してください");
      }
      setAvatarUrl(result.avatarUrl);
      router.refresh();
    } catch (saveError) {
      router.refresh();
      throw saveError;
    } finally {
      setProcessingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!avatarUrl || processingAvatar) return;
    setProcessingAvatar(true);
    setError(null);
    try {
      const response = await fetch("/api/avatar", { method: "DELETE" }).catch(() => { throw new Error("画像の削除結果を確認できませんでした。画面を開き直して確認してください"); });
      const result = (await response.json().catch(() => { throw new Error("画像の削除結果を確認できませんでした。画面を開き直して確認してください"); })) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "画像を削除できませんでした。もう一度お試しください");
      }
      setAvatarUrl("");
      router.refresh();
    } catch (removeError) {
      router.refresh();
      setError(
        removeError instanceof Error
          ? removeError.message
          : "画像を削除できませんでした。もう一度お試しください",
      );
    } finally {
      setProcessingAvatar(false);
    }
  }

  return { avatarUrl, avatarCropFile, setAvatarCropFile, processingAvatar, avatarInputRef, selectAvatar, uploadCroppedAvatar, removeAvatar };
}
