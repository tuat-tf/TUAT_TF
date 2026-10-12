"use client";
import { FloatingActionPosition, floatingActionButtonClass } from "@/components/ui/floating-action";
import { GlassMenu, type GlassMenuItem } from "@/components/ui/glass-menu";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { withIntentPreload } from "@/components/ui/intent-form";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BellPlus,
  CalendarPlus,
  FolderPlus,
  ImagePlus,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Plus,
  Trophy,
} from "lucide-react";
import { FormModal, type useFormDraft } from "@/components/ui/form-modal";
import { SegmentedControl } from "@/components/ui/segmented";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import type { MonthlyPlanningEditorHandle } from "@/components/features/MonthlyPlanningEditorV2";
import type { RecordFormHandle } from "@/components/post/RecordForm";
import { useCompetitionCatalog } from "@/components/post/use-competition-catalog";
import type { TweetFormHandle } from "@/components/post/TweetForm";
import { FormSkeleton } from "@/components/ui/page-skeletons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AuthorMini, RecordFieldDef, ScheduleType } from "@/types";

// Keep forms out of navigation's initial bundle. Warm only on a user's intent,
// so choosing a menu item does not start a second, serial loading delay.

const MonthlyPlanningEditorV2 = withIntentPreload(
  dynamic(() => import("@/components/features/MonthlyPlanningEditorV2").then(m => m.MonthlyPlanningEditorV2), { loading: FormSkeleton }),
  () => import("@/components/features/MonthlyPlanningEditorV2").then(m => m.MonthlyPlanningEditorV2),
);
const NoteArticleEditor = withIntentPreload(
  dynamic(() => import("@/components/features/NoteArticleEditor").then(m => m.NoteArticleEditor), { loading: FormSkeleton }),
  () => import("@/components/features/NoteArticleEditor").then(m => m.NoteArticleEditor),
);
const ThreadComposer = withIntentPreload(
  dynamic(() => import("@/components/features/ThreadList").then(m => m.ThreadComposer), { loading: FormSkeleton }),
  () => import("@/components/features/ThreadList").then(m => m.ThreadComposer),
);
const NoteComposer = withIntentPreload(
  dynamic(() => import("@/components/features/NoteComposer").then(m => m.NoteComposer), { loading: FormSkeleton }),
  () => import("@/components/features/NoteComposer").then(m => m.NoteComposer),
);
const NoticeForm = withIntentPreload(
  dynamic(() => import("@/components/post/NoticeForm").then(m => m.NoticeForm), { loading: FormSkeleton }),
  () => import("@/components/post/NoticeForm").then(m => m.NoticeForm),
);
const RecordForm = withIntentPreload(
  dynamic(() => import("@/components/post/RecordForm").then(m => m.RecordForm), { loading: FormSkeleton }),
  () => import("@/components/post/RecordForm").then(m => m.RecordForm),
);
const ResultForm = withIntentPreload(
  dynamic(() => import("@/components/post/ResultForm").then(m => m.ResultForm), { loading: FormSkeleton }),
  () => import("@/components/post/ResultForm").then(m => m.ResultForm),
);
const TweetForm = withIntentPreload(
  dynamic(() => import("@/components/post/TweetForm").then(m => m.TweetForm), { loading: FormSkeleton }),
  () => import("@/components/post/TweetForm").then(m => m.TweetForm),
);
const ScheduleForm = withIntentPreload(
  dynamic(() => import("@/components/post/ScheduleForm").then(m => m.ScheduleForm), { loading: FormSkeleton }),
  () => import("@/components/post/ScheduleForm").then(m => m.ScheduleForm),
);
const ScheduleCreatePanel = withIntentPreload(
  dynamic(() => import("@/components/post/ScheduleForm").then(m => m.ScheduleCreatePanel), { loading: FormSkeleton }),
  () => import("@/components/post/ScheduleForm").then(m => m.ScheduleCreatePanel),
);

const formPreloads = {
  record: RecordForm.preload,
  tweet: TweetForm.preload,
  result: ResultForm.preload,
  planning: MonthlyPlanningEditorV2.preload,
  notice: NoticeForm.preload,
  article: NoteArticleEditor.preload,
  folder: NoteComposer.preload,
  thread: ThreadComposer.preload,
};
function warmForm(kind: keyof typeof formPreloads) { formPreloads[kind](); }

export type FabPermissions = {
  createSchedule: boolean;
  createMenu: boolean;
  createNotice: boolean;
  manageMembers: boolean;
};

type DirectForm = "schedule" | "planning" | "notice" | "article" | "folder" | "subfolder" | "thread" | null;

type FabProps = {
  userId: string;
  currentUser: AuthorMini;
  isMiddleLong: boolean;
  recordSource: "app" | "sheet";
  recordFields: RecordFieldDef[];
  sheetTransition?: import("@/lib/sheet-period").SheetTransition | null;
  systemRecordForm: boolean;
  can: FabPermissions;
};

export function FAB(props: FabProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  return (
    <ContextualFAB
      key={routeKey}
      {...props}
      pathname={pathname}
      autoOpen={searchParams.get("compose") === "1"}
    />
  );
}

function ContextualFAB({
  userId,
  currentUser,
  isMiddleLong,
  recordSource,
  recordFields,
  sheetTransition,
  systemRecordForm,
  can,
  pathname,
  autoOpen,
}: FabProps & {
  pathname: string;
  autoOpen: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [tweetOpen, setTweetOpen] = useState(false);
  const [tweetInitialStory, setTweetInitialStory] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const catalog = useCompetitionCatalog(resultOpen);
  const recordRef = useRef<RecordFormHandle>(null);
  const tweetRef = useRef<TweetFormHandle>(null);
  const [recordDirty, setRecordDirty] = useState(false);
  const [tweetDirty, setTweetDirty] = useState(false);
  const [pendingTimelineClose, setPendingTimelineClose] = useState<"record" | "tweet" | null>(null);
  const planningRef = useRef<MonthlyPlanningEditorHandle>(null);
  const [planningDirty, setPlanningDirty] = useState(false);
  const [scheduleType, setScheduleType] = useState<
    Extract<ScheduleType, "practice" | "meet" | "time_trial">
  >("practice");
  const [pendingScheduleType, setPendingScheduleType] = useState<typeof scheduleType | null>(null);
  const planningDraft = useRef<Parameters<typeof useFormDraft>[0] | null>(null);
  const [planningDraftFlags, setPlanningDraftFlags] = useState({ dirty: false, busy: false });
  const onPlanningDraftChange = useCallback((draft: Parameters<typeof useFormDraft>[0] | null) => {
    planningDraft.current = draft;
    const next = { dirty: !!draft?.dirty, busy: !!draft?.busy };
    setPlanningDraftFlags((current) => current.dirty === next.dirty && current.busy === next.busy ? current : next);
  }, []);
  const [canEditArticles, setCanEditArticles] = useState(false);
  const [folderInfo, setFolderInfo] = useState<{
    scope: "shared" | "personal";
    depth: number;
    canManage: boolean;
  } | null>(null);
  const [directForm, setDirectForm] = useState<DirectForm>(() => {
    if (autoOpen && pathname === "/schedule" && (can.createSchedule || can.createMenu)) {
      return "planning";
    }
    if (autoOpen && pathname === "/notices" && can.createNotice) {
      return "notice";
    }
    return null;
  });

  const isFeed = pathname === "/home" || pathname === "/timeline";
  const isSchedule = pathname === "/schedule" && (can.createSchedule || can.createMenu);
  const isNotice = pathname === "/notices" && can.createNotice;
  const isNotesRoot = pathname === "/notes";
  const noteFolderMatch = pathname.match(/^\/notes\/([^/]+)$/);
  const noteId = noteFolderMatch?.[1] ?? null;
  const isNoteFolder = Boolean(noteId && canEditArticles);
  const visible = isFeed || isSchedule || isNotice || isNotesRoot || isNoteFolder;

  useEffect(() => {
    if (!noteId) return;
    let active = true;
    const supabase = createClient();
    void supabase
      .rpc("can_edit_note", { target_note_id: noteId })
      .then(({ data }) => {
        if (active) setCanEditArticles(data === true);
      });
    // サブフォルダ作成メニュー用: フォルダのscope・深さ（3階層まで）・管理可否
    void (async () => {
      const { data: folder } = await supabase
        .from("notes")
        .select("id, scope, parent_id, author_id")
        .eq("id", noteId)
        .maybeSingle();
      if (!active || !folder) return;
      let depth = 1;
      let parentId = (folder as { parent_id: string | null }).parent_id;
      while (parentId && depth < 3) {
        depth++;
        const { data: parent } = await supabase
          .from("notes")
          .select("parent_id")
          .eq("id", parentId)
          .maybeSingle();
        parentId = (parent as { parent_id: string | null } | null)?.parent_id ?? null;
      }
      if (!active) return;
      setFolderInfo({
        scope: (folder as { scope: "shared" | "personal" }).scope,
        depth,
        canManage:
          (folder as { author_id: string }).author_id === userId || can.manageMembers,
      });
    })();
    return () => {
      active = false;
    };
  }, [noteId, userId, can.manageMembers]);

  function handleMainAction() {
    if (isFeed) {
      setSpeedDialOpen((open) => !open);
      return;
    }
    if (isSchedule) setDirectForm("planning");
    if (isNotice) setDirectForm("notice");
    if (isNotesRoot) {
      setSpeedDialOpen((open) => !open);
      return;
    }
    if (isNoteFolder) {
      // サブフォルダを作れる立場なら2択メニュー、そうでなければ従来どおり記事作成へ直行
      if (isNoteFolder || (folderInfo?.canManage && folderInfo.depth < 3)) {
        setSpeedDialOpen((open) => !open);
      } else {
        setDirectForm("article");
      }
    }
  }

  function closeTimelineForm(kind: "record" | "tweet" | "result") {
    if (kind === "record") { setRecordDirty(false); setRecordOpen(false); }
    if (kind === "tweet") { setTweetDirty(false); setTweetOpen(false); setTweetInitialStory(false); }
    if (kind === "result") setResultOpen(false);
    setPendingTimelineClose(null);
  }

  function savePendingTimelineForm() {
    const kind = pendingTimelineClose;
    setPendingTimelineClose(null);
    if (kind === "record") recordRef.current?.save();
    if (kind === "tweet") tweetRef.current?.save();
  }

  function handlePlanningSaved() {
    closeDirectForm();
    void queryClient.invalidateQueries({ queryKey: ["schedule", userId] });
    void queryClient.invalidateQueries({ queryKey: ["middle-long-menu-csv", userId] });
  }

  function closeDirectForm() {
    setScheduleType("practice");
    setPlanningDirty(false);
    setPendingScheduleType(null);
    planningDraft.current = null;
    setPlanningDraftFlags({ dirty: false, busy: false });
    setDirectForm(null);
    if (autoOpen) router.back();
  }

  if (!visible) return null;

  const label = isFeed
    ? speedDialOpen
      ? "作成メニューを閉じる"
      : "作成メニューを開く"
    : isSchedule
      ? "予定を作成"
      : isNotice
        ? "お知らせを作成"
        : isNotesRoot
          ? "作成メニューを開く"
          : "このフォルダに作成";

  const hasMenu = isFeed || isNotesRoot || isNoteFolder;
  const warmMainAction = () => warmForm(isFeed ? "record" : isSchedule ? "planning"
    : isNotice ? "notice" : isNotesRoot ? "folder" : "article");
  const glassItems: GlassMenuItem[] = isFeed ? [
    { key: "record", label: "練習記録", icon: <Activity size={21} />, onIntent: () => warmForm("record"), onSelect: () => setRecordOpen(true) },
    { key: "tweet", label: "つぶやき", icon: <MessageCircle size={21} />, onIntent: () => warmForm("tweet"), onSelect: () => { setTweetInitialStory(false); setTweetOpen(true); } },
    { key: "story", label: "ストーリー", icon: <ImagePlus size={21} />, onIntent: () => warmForm("tweet"), onSelect: () => { setTweetInitialStory(true); setTweetOpen(true); } },
    { key: "result", label: "大会・記録会の結果", icon: <Trophy size={21} />, onIntent: () => warmForm("result"), onSelect: () => setResultOpen(true) },
  ] : isNotesRoot ? [
    { key: "folder", label: "フォルダ", icon: <FolderPlus size={21} />, onIntent: () => warmForm("folder"), onSelect: () => setDirectForm("folder") },
  ] : [
    { key: "article", label: "記事", icon: <NotebookPen size={21} />, onIntent: () => warmForm("article"), onSelect: () => setDirectForm("article") },
    { key: "subfolder", label: "サブフォルダ", icon: <FolderPlus size={21} />, onIntent: () => warmForm("folder"), onSelect: () => setDirectForm("subfolder") },
    { key: "thread", label: "スレッド", icon: <MessagesSquare size={21} />, onIntent: () => warmForm("thread"), onSelect: () => setDirectForm("thread") },
  ];
  const trigger = <button
          type="button"
          onPointerEnter={warmMainAction} onPointerDown={warmMainAction} onFocus={warmMainAction}
          onClick={hasMenu ? undefined : handleMainAction}
          aria-label={label}
          aria-expanded={isFeed || isNotesRoot || isNoteFolder ? speedDialOpen : undefined}
          className={floatingActionButtonClass}
        >
          {isFeed || isNotesRoot || isNoteFolder ? (
            <Plus
              size={28}
              strokeWidth={2.5}
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                speedDialOpen && "rotate-45",
              )}
            />
          ) : (
            <span key={pathname} className="flex">
              {isSchedule && <CalendarPlus size={25} />}
              {isNotice && <BellPlus size={25} />}
              {isNotesRoot && <FolderPlus size={25} />}
              {isNoteFolder && <NotebookPen size={25} />}
              {/* サブフォルダを作れる場合は上のPlus分岐が使われる */}
            </span>
          )}
        </button>;
  return (
    <>

      <FloatingActionPosition>

        {hasMenu ? <GlassMenu open={speedDialOpen} onOpenChange={setSpeedDialOpen} label="作成メニュー" trigger={trigger} items={glassItems} placement="above" /> : trigger}
      </FloatingActionPosition>

      <FormModal open={recordOpen} onOpenChange={(open) => { if (!open) { if (recordDirty) setPendingTimelineClose("record"); else closeTimelineForm("record"); } }} title="練習記録">
        <RecordForm
          ref={recordRef}
          userId={userId}
          isMiddleLong={isMiddleLong}
          recordSource={recordSource}
          recordFields={recordFields}
          sheetTransition={sheetTransition}
          systemRecordForm={systemRecordForm}
          onDirtyChange={setRecordDirty}
          onDone={() => closeTimelineForm("record")}
        />
      </FormModal>

      <FormModal open={tweetOpen} onOpenChange={(open) => { if (!open) { if (tweetDirty) setPendingTimelineClose("tweet"); else closeTimelineForm("tweet"); } }} title={tweetInitialStory ? "ストーリー" : "つぶやき"}>
        <TweetForm key={tweetInitialStory ? "story" : "tweet"} ref={tweetRef} initialStory={tweetInitialStory} onDirtyChange={setTweetDirty} onDone={() => closeTimelineForm("tweet")} />
      </FormModal>

      <FormModal
        open={resultOpen}
        onOpenChange={(open) => !open && closeTimelineForm("result")}
        intent="post"
        title="大会・記録会の結果"
      >
        <ResultForm userId={userId} events={catalog.events} competitions={catalog.competitions} onDone={() => closeTimelineForm("result")} />
      </FormModal>

      <UnsavedChangesDialog open={pendingTimelineClose !== null} busy={false} intent="post" onContinue={() => setPendingTimelineClose(null)} onDiscard={() => { if (pendingTimelineClose) closeTimelineForm(pendingTimelineClose); }} onSave={savePendingTimelineForm} />

      <FormModal open={directForm === "planning"} autoFocus={false} onOpenChange={(open) => !open && closeDirectForm()} title="予定" intent="save">
        <div className="space-y-5">
          <fieldset disabled={planningDraftFlags.busy}>
            <SegmentedControl
            items={[
              { key: "practice", label: "練習" },
              { key: "meet", label: "大会・行事" },
              { key: "time_trial", label: "記録会" },
            ]}
            value={scheduleType}
            onChange={(key) => {
              const next = key as typeof scheduleType;
              if (next === scheduleType || planningDraftFlags.busy) return;
              if (planningDraftFlags.dirty || (scheduleType === "practice" && planningDirty)) setPendingScheduleType(next);
              else setScheduleType(next);
            }}
          />
          </fieldset>
          {scheduleType === "practice" ? (
            <MonthlyPlanningEditorV2 ref={planningRef} initialTab="schedule" canSchedule={can.createSchedule} canMenu={can.createMenu} onDirtyChange={setPlanningDirty} onDraftChange={onPlanningDraftChange} onSaved={handlePlanningSaved} onClose={closeDirectForm} />
          ) : (
            <ScheduleForm
              key={scheduleType}
              initialType={scheduleType}
              showTypeSelector={false}
              onDone={handlePlanningSaved}
              onDraftChange={onPlanningDraftChange}
            />
          )}
        </div>
      </FormModal>
      <UnsavedChangesDialog
        open={pendingScheduleType !== null}
        busy={planningDraftFlags.busy}
        intent="save"
        onContinue={() => setPendingScheduleType(null)}
        onDiscard={() => {
          if (planningDraftFlags.busy || pendingScheduleType === null) return;
          setScheduleType(pendingScheduleType); setPendingScheduleType(null);
        }}
        onSave={() => {
          if (planningDraftFlags.busy) return;
          setPendingScheduleType(null); void planningDraft.current?.onSave();
        }}
      />

      <FormModal
        open={directForm === "schedule"}
        autoFocus={false}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="予定"
      >
        <ScheduleCreatePanel onDone={closeDirectForm} />
      </FormModal>

      <FormModal
        open={directForm === "notice"}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="お知らせ"
      >
        <NoticeForm onDone={closeDirectForm} />
      </FormModal>

      <FormModal
        open={directForm === "folder"}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="フォルダ"
      >
        <NoteComposer
          currentUser={currentUser}
          isAdmin={can.manageMembers}
          onDone={closeDirectForm}
        />
      </FormModal>

      <FormModal
        open={directForm === "thread"}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="スレッド"
      >
        {noteId && <ThreadComposer userId={userId} folderId={noteId} onDone={closeDirectForm} />}
      </FormModal>

      <FormModal
        open={directForm === "subfolder"}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="サブフォルダ"
      >
        {noteId && folderInfo && (
          <NoteComposer
            currentUser={currentUser}
            isAdmin={can.manageMembers}
            initialScope={folderInfo.scope}
            parentId={noteId}
            onDone={closeDirectForm}
          />
        )}
      </FormModal>

      <FormModal
        open={directForm === "article"}
        onOpenChange={(open) => !open && closeDirectForm()}
        title="記事"
      >
        {noteId && (
          <NoteArticleEditor
            noteId={noteId}
            currentUser={currentUser}
            onDone={closeDirectForm}
          />
        )}
      </FormModal>
    </>
  );
}
