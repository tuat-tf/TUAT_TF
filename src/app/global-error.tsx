"use client";

import { useEffect } from "react";

// ルートレイアウト自体が失敗したときの最終画面。アプリのCSS・Providerに頼らず、この中だけで完結させる。
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Root layout failed to render", { error, digest: error.digest });
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, background: "#f2f2f7", color: "#1c1c1e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400, boxSizing: "border-box", background: "#fff", border: "1px solid #d1d1d6", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>{"画面を表示できませんでした"}</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15, color: "#6c6c70" }}>
              {"通信状態を確認して、もう一度お試しください。"}
            </p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ marginTop: 20, width: "100%", minHeight: 44, border: 0, borderRadius: 12, background: "#007aff", color: "#fff", fontSize: 16, fontWeight: 600 }}
            >
              {"再試行"}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
