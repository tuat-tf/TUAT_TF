const reservedPorts = new Set([8000, 3008, 3109, 3112]);

/** Public selection of the PC-local Auth and data API. */
export function pcAppLocalAuthEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_PC_LOCAL_RUNTIME !== "true") return false;
  if (process.env.NEXT_PUBLIC_PC_APP_RUNTIME !== "true" || process.env.NEXT_PUBLIC_PC_BACKEND !== "true" ||
      process.env.NEXT_PUBLIC_PC_REST_RELAY_ORIGIN || process.env.NEXT_PUBLIC_PC_TRIAL === "true") {
    throw new Error("Local Auth requires one PC origin without cloud authentication or legacy relay");
  }
  if (process.env.NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW !== "true") {
    try {
      const parts = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.split(".");
      const decode = (part: string) => JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/")));
      if (parts.length !== 3 || !["HS256","ES256","RS256"].includes(decode(parts[0]).alg) || decode(parts[1]).role !== "anon") throw new Error();
    } catch { throw new Error("Local Auth requires a public anon JWT; privileged keys must remain server-only"); }
  }
  return true;
}

export function syntheticLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return value === url.origin && url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      Number(url.port) >= 1024 && Number(url.port) <= 65535 && !reservedPorts.has(Number(url.port));
  } catch { return false; }
}
