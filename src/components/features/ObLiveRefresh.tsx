"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { jstToday } from "@/lib/date";

function subscribe(listener:()=>void) {
  window.addEventListener("online",listener);window.addEventListener("offline",listener);
  return ()=>{window.removeEventListener("online",listener);window.removeEventListener("offline",listener);};
}
export function isMeetLive(startsOn: string, endsOn: string | null | undefined, today = jstToday()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(startsOn) && today >= startsOn && today <= (endsOn || startsOn);
}

export function ObLiveRefresh({readOnly=false, startsOn, endsOn}:{readOnly?:boolean; startsOn: string; endsOn?: string | null}) {
  const online=useSyncExternalStore(subscribe,()=>navigator.onLine,()=>true);
  const router=useRouter(),[pending,startTransition]=useTransition();
  useEffect(()=>{
    // Never replace a route beneath an open editor; its save reconciles newer data.
    const refresh=()=>{if(isMeetLive(startsOn,endsOn)&&document.visibilityState==="visible"&&navigator.onLine&&!document.querySelector('[role="dialog"]'))startTransition(()=>router.refresh());};
    let timer: ReturnType<typeof setTimeout>;
    const schedule=()=>{
      // Outside the meet, wait until the next JST date boundary without making a request.
      const untilMidnight=86_400_000-((Date.now()+9*3_600_000)%86_400_000);
      timer=setTimeout(()=>{refresh();schedule();},isMeetLive(startsOn,endsOn)?30_000:untilMidnight);
    };
    schedule();
    window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);
    return ()=>{clearTimeout(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[router, startsOn, endsOn]);
  return <div className="flex items-center justify-end gap-3">{!online&&<p role="status" className="text-caption text-amber-700">{readOnly ? "通信が切れています。最後に取得した結果を表示しています。" : "通信が切れています。編集中の内容は保存まで残ります。"}</p>}<button type="button" aria-label="大会情報を最新に更新" disabled={!online||pending} onClick={()=>startTransition(()=>router.refresh())} className="flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm text-muted disabled:opacity-50"><RefreshCw size={15} className={pending?"animate-spin":""}/>{pending?"更新中":"最新に更新"}</button></div>;
}
