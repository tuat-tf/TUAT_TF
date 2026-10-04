"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FullScreen, FullScreenContent } from "@/components/ui/fullscreen";
import { UnsavedChangesDialog, type UnsavedIntent } from "@/components/ui/unsaved-changes-dialog";

type DraftState = { dirty: boolean; busy: boolean; onSave: () => void | Promise<void>; intent?: UnsavedIntent };
type DraftContext = { register: (state: DraftState) => () => void; requestChange: (change: () => void) => void };
const FormDraftContext = createContext<DraftContext | null>(null);

/** 子フォームの変更・保存状態を親の閉じる操作へ伝える。 */
export function useFormDraft(state: DraftState) {
  const context = useContext(FormDraftContext);
  useLayoutEffect(() => {
    return context?.register(state);
  }, [context, state]);
}
export function FormDraftGuard(props: DraftState) {
  useFormDraft(props);
  return null;
}

/** 入力方式などの切替にも、閉じる操作と同じ未保存確認を使う。 */
export function useFormChangeGuard() {
  const context = useContext(FormDraftContext);
  return context?.requestChange ?? ((change: () => void) => change());
}

type FooterContextValue = {
  target: HTMLDivElement | null;
  register: () => () => void;
};

const FormModalFooterContext = createContext<FooterContextValue | null>(null);

export function FormModal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  autoFocus = true,
  floatingAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  autoFocus?: boolean;
  floatingAction?: ReactNode;
}) {
  const draft = useRef<DraftState | null>(null);
  const pendingChange = useRef<(() => void) | null>(null);
  const [confirmClose, setConfirmClose] = useState<UnsavedIntent | null>(null);
  const registerDraft = useCallback((state: DraftState) => {
    draft.current = state;
    return () => { if (draft.current === state) draft.current = null; };
  }, []);
  const requestChange = useCallback((change: () => void) => {
    if (draft.current?.busy) return;
    if (draft.current?.dirty) {
      pendingChange.current = change;
      setConfirmClose(draft.current.intent ?? "save");
      return;
    }
    change();
  }, []);
  const draftContext = useMemo(() => ({ register: registerDraft, requestChange }), [registerDraft, requestChange]);
  function requestOpenChange(next: boolean) {
    if (!next) requestChange(() => onOpenChange(false));
    else onOpenChange(true);
  }
  const [footerCount, setFooterCount] = useState(0);
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const context = useMemo<FooterContextValue>(
    () => ({
      target: footerTarget,
      register: () => {
        setFooterCount((count) => count + 1);
        return () => setFooterCount((count) => Math.max(0, count - 1));
      },
    }),
    [footerTarget],
  );
  const footerHost =
    footer ??
    (footerCount > 0 ? <div ref={setFooterTarget} className="w-full" /> : undefined);

  return (
    <>
    <FullScreen open={open} onOpenChange={requestOpenChange}>
      <FullScreenContent
        title={title}
        footer={footerHost}
        autoFocus={autoFocus}
        floatingAction={floatingAction}
      >
        <FormModalFooterContext.Provider value={context}>
          <FormDraftContext.Provider value={draftContext}>
            {children}
          </FormDraftContext.Provider>
        </FormModalFooterContext.Provider>
      </FullScreenContent>
    </FullScreen>
    <UnsavedChangesDialog open={open && confirmClose !== null} busy={false} intent={confirmClose ?? "save"}
      onContinue={() => { pendingChange.current = null; setConfirmClose(null); }}
      onDiscard={() => { if (draft.current?.busy) return; setConfirmClose(null); const change = pendingChange.current; pendingChange.current = null; change?.(); }}
      onSave={() => { if (draft.current?.busy) return; pendingChange.current = null; setConfirmClose(null); void draft.current?.onSave(); }} />
    </>
  );
}

/** 子フォームの送信操作を FormModal の固定フッターへ配置する。 */
export function FormModalFooter({ children }: { children: ReactNode }) {
  const context = useContext(FormModalFooterContext);

  useEffect(() => {
    if (!context) return;
    return context.register();
  }, [context]);

  if (!context) return children;
  return context.target ? createPortal(children, context.target) : null;
}
