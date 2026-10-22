import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { SubHeader } from "@/components/layout/SubHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { clubRecordSource, getClubRecordHtml } from "@/lib/club-records";
import { getCurrentUserId } from "@/lib/supabase/auth";

export default async function ClubRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUserId();
  const { id } = await params;
  const source = clubRecordSource(id);
  if (!source) notFound();
  let html: string | null = null;
  try { html = await getClubRecordHtml(id); } catch { /* Keep source failures separate from an unknown category. */ }
  return <>
    <SubHeader title={source.label} backHref="/club-records" forceBackHref />
    <main className="space-y-4 px-4 pb-6 pt-1 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-headline">歴代十傑・{source.label}</h1><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-caption text-accent">公式ページ<ExternalLink size={14} /></a></div>
      {html !== null ? <Card className="p-3 sm:p-4"><p className="text-micro text-muted">表は横にスクロールできます。</p><div role="region" aria-label={`${source.label}の記録表。横にスクロールできます`} tabIndex={0} className="overflow-x-auto overscroll-x-contain text-sm leading-relaxed [&_table]:my-4 [&_table]:min-w-[36rem] [&_table]:border-collapse [&_td]:border [&_td]:border-separator [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-separator [&_th]:px-3 [&_th]:py-2 [&_p]:my-3 [&_h1]:text-title [&_h2]:text-headline [&_hr]:border-separator" dangerouslySetInnerHTML={{ __html: html }} /></Card>
        : <Card className="p-4"><EmptyState icon={<Trophy size={28} />} title="記録を読み込めませんでした" description="時間をおいて開き直すか、公式ページをご覧ください。" className="min-h-36" /></Card>}
    </main>
  </>;
}
