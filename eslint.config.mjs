import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tuat-tf-next/**",
    // 作業コピー・非公開の運用状態は現行コードの検査へ混ぜない。
    ".worktrees/**",
    "**/.contingency/**",
    ".r2-migration/**",
    // Apps Script の公開エントリポイントとローカル専用secretはJS側から直接参照される。
    "gas/sync-clasp/Code.js",
    "gas/sync-clasp/secret.js",
  ]),
]);

export default eslintConfig;
