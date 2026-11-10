import { configuredAppPublicOrigin } from "./app-public-origin";
import { getPcLocalRuntime, type PcLocalRuntime } from "./pc-local-runtime";

export type PcAppRuntime = { publicOrigin: string; internalUrl: string; synthetic: boolean; local: PcLocalRuntime };

/** The production (PC) runtime. Undefined only for unconfigured development and tests. */
export function getPcAppRuntime(): PcAppRuntime | undefined {
  const server = process.env.PC_APP_RUNTIME === "true";
  const browser = process.env.NEXT_PUBLIC_PC_APP_RUNTIME === "true";
  if (!server && !browser) return undefined;
  if (!server || !browser || typeof window !== "undefined" ||
      process.env.PC_BACKEND_ENABLED !== "true" || process.env.NEXT_PUBLIC_PC_BACKEND !== "true") {
    throw new Error("PC app requires its complete runtime flags");
  }
  const publicOrigin = configuredAppPublicOrigin();
  if (!publicOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== `${publicOrigin}/api/pc-supabase`) {
    throw new Error("PC app requires its fixed same-origin data API");
  }
  const synthetic = process.env.PC_APP_SYNTHETIC_REVIEW === "true";
  if (synthetic !== (process.env.NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW === "true")) {
    throw new Error("Synthetic PC app flags must match");
  }
  const local = getPcLocalRuntime();
  if (!local) throw new Error("PC app requires the local runtime");
  if (synthetic && (!/(?:\.example\.test|\.localhost)$/.test(new URL(publicOrigin).hostname) || process.env.SHEET_SYNC_ENABLED !== "false" ||
      process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.SHEET_SYNC_GAS_URL)) {
    throw new Error("Synthetic local runtime requires disabled external providers");
  }
  return { publicOrigin, internalUrl: local.restUrl, local, synthetic };
}
