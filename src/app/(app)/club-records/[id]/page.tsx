import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { SubHeader } from "@/components/layout/SubHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { clubRecordSource } from "@/lib/club-records";
import { getClubRecordHtml } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/supabase/auth";
import styles from "./records.module.css";

export default async function ClubRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentUserId();
  const { id } = await params;
  const source = clubRecordSource(id);
  if (!source) notFound();
  let html: string | null = null;
  try { html = await getClubRecordHtml(id); } catch { /* Keep source failures separate from an unknown category. */ }
  return <>
    <SubHeader title={source.label} backHref="/club-records" />
    <main className="min-w-0 px-4 pb-8 pt-1 md:px-6">
      {html !== null ? <Card className="overflow-hidden"><article className="min-w-0 px-4 py-5 sm:px-6">
        <header className="border-b border-separator pb-4"><p className="text-caption text-muted">東京農工大学陸上競技部</p><h1 className="mt-1.5 text-[22px] font-bold leading-snug tracking-[-0.02em]">歴代十傑・{source.label}</h1><div className="mt-2 flex flex-wrap items-center justify-between gap-x-3"><p className="text-caption text-muted">表は横にスクロールできます。</p><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-caption text-accent">公式ページ<ExternalLink size={14} /></a></div></header>
        <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
      </article></Card>
        : <Card className="p-4"><EmptyState icon={<Trophy size={28} />} title="記録を読み込めませんでした" description="時間をおいて開き直すか、公式ページをご覧ください。" className="min-h-36" /></Card>}
    </main>
  </>;
}
