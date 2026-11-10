import { pcBackendFetch } from "../pc-backend";

/** Server-only transport credentials; never import this from a browser client. */
export function pcServerOptions(): { global?: { fetch?: typeof fetch; headers?: Record<string, string> } } {
  if (process.env.PC_BACKEND_ENABLED === "true") return { global: { fetch: pcBackendFetch } };
  return {};
}
