import { createHmac } from "node:crypto";
import { OB_MEET } from "./ob-meet";

export const OB_RESULTS_SPREADSHEET_ID = "1b1KueR6oR0v_3UKpJUpzOrYKjPJW1-Q4Dg8digEaB8M";

/** Give the private publisher this read-only derived key, never the all-purpose sync secret. */
export function obResultsFeedToken(secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["ob-results-v1", OB_MEET.meetKey, OB_RESULTS_SPREADSHEET_ID])).digest("hex");
}

/** Separate, fixed-meet permission for status edits only. */
export function obResultsStatusToken(secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["ob-status-v1", OB_MEET.meetKey, OB_RESULTS_SPREADSHEET_ID])).digest("hex");
}
