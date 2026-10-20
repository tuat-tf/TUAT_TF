import { NextResponse } from "next/server";
import { isObCompetition, OB_PROGRAM_PATH } from "@/lib/ob-meet";

/** Old self-entry bookmarks now open the canonical result page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isObCompetition(id)) return new NextResponse(null, { status: 404 });
  // Keep the public origin when the server receives an internal proxy URL.
  return new NextResponse(null, { status: 307, headers: { location: OB_PROGRAM_PATH } });
}
