// Server only: never return credentials or raw provider errors.
import { unstable_cache } from "next/cache";
import { getImageInventory } from "@/lib/image-storage";

export type ServiceHealth = {
  indicator: "none" | "minor" | "major" | "critical" | "unknown";
  incidents: string[];
};
export type ServiceStatus = {
  checkedAt: string;
  health: { cloudflare: ServiceHealth };
  inventory: { state: "ready" | "error"; bytes: number | null; objects: number | null };
  images: { paused: boolean; limitBytes: number | null };
};

export function parseHealth(value: unknown): ServiceHealth {
  const data = value as { status?: { indicator?: string }; incidents?: { name?: string }[] } | null;
  const indicator = data?.status?.indicator;
  if (!indicator || !["none", "minor", "major", "critical"].includes(indicator)) throw new Error("Invalid status response");
  return { indicator: indicator as ServiceHealth["indicator"], incidents: (data?.incidents ?? []).slice(0, 5).map((i) => String(i.name ?? "障害情報").slice(0, 200)) };
}

async function health(url: string): Promise<ServiceHealth> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Status unavailable");
    return parseHealth(await response.json());
  } catch { return { indicator: "unknown", incidents: [] }; }
}

async function inventory(): Promise<ServiceStatus["inventory"]> {
  try { return { state: "ready", ...await getImageInventory() }; }
  catch { return { state: "error", bytes: null, objects: null }; }
}

/** Only call after checking manage_system. No cookies/session inside this shared cache. */
export async function getServiceStatus(): Promise<ServiceStatus> {
  const snapshot = await unstable_cache(async () => {
    const [cloudflare, images] = await Promise.all([health("https://www.cloudflarestatus.com/api/v2/summary.json"), inventory()]);
    return { checkedAt: new Date().toISOString(), health: { cloudflare }, inventory: images };
  }, ["service-status-v4", process.env.PC_APP_RELEASE_ID ?? "local"], { revalidate: 900 })();
  const limit = Number(process.env.LOCAL_IMAGE_MAX_STORAGE_BYTES ?? 8_000_000_000);
  return { ...snapshot, images: {
    paused: process.env.LOCAL_IMAGE_UPLOADS_PAUSED === "true",
    limitBytes: Number.isSafeInteger(limit) && limit > 0 ? limit : null,
  } };
}
