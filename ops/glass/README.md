# 旧ガラス描画方式の保管

`vendor/` は旧 WebGL・画像取込み方式の生成物とライセンスの保管先。
現在のアプリからは読み込まないため、公開 `public/` から移した。
`BottomNav` が動的に読み込む `src/components/layout/glass/mount-glass.ts` は
現在の直接透過と操作補助であり、この bundle とは別の実装。

旧方式を比較する場合のみ `build-vendor.mjs` で固定 upstream から
`vendor/` へ再生成し、`verify-images.mjs` で合成ブラウザ試験を行う。
生成処理は公開 assets を書き換えない。通知・MIT ライセンスと
`SOURCE.md` を bundle と一緒に保全する。
