"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { flushPendingSales, getPendingSales } from "@/lib/festival-offline";

const RETRY_INTERVAL_MS = 15_000;

/**
 * 端末に置いた学祭の売上をサーバーへ送る。
 * 返り値の行は読まない（return=minimal）。直近1時間しか読めない人が1時間より前の売上を
 * 送ると、読み返しだけがRLSで断られて「送れなかった」に見えてしまうため。
 */
export function sendPendingFestivalSales() {
  const supabase = createClient();
  return flushPendingSales((sale, signal) =>
    supabase
      .from("festival_sales")
      .insert({ id: sale.id, quantity: sale.quantity, amount: sale.amount, sold_at: sale.soldAt, recorded_by: sale.recordedBy })
      .abortSignal(signal),
  );
}

/**
 * どの画面にいても、残っている売上を送り続ける（アプリ全体に1つだけ置く）。
 * 開いたとき・電波が戻ったとき・アプリに戻ったとき・残っている間は15秒ごとに送る。
 * 何も残っていなければ通信しない。
 */
export function FestivalSalesSync() {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const run = () => {
      if (getPendingSales().every((sale) => sale.failed)) return;
      sendPendingFestivalSales().then((sent) => {
        if (sent > 0 && !stopped) router.refresh();
      }).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, RETRY_INTERVAL_MS);
    return () => {
      stopped = true;
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}
