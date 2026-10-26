import { redirect } from "next/navigation";

/** 検索はタイムラインの中で開く。以前の /timeline/search?q= のリンクはそこへ送る。 */
export default async function TimelineSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = ((Array.isArray(params.q) ? params.q[0] : params.q) ?? "").trim();
  redirect(query ? `/timeline?q=${encodeURIComponent(query)}` : "/timeline");
}
