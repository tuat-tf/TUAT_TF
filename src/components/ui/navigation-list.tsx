import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

/** ページへのリンクを一枚のカードにまとめる。外周の角丸と内部の区切り線を分ける。 */
export function NavigationList({ children }: { children: ReactNode }) {
  return <Card data-ui-navigation-list className="overflow-hidden">{children}</Card>;
}

export function NavigationLink({ href, label, description, icon, prefetch }: {
  href: string;
  label: string;
  description?: string;
  icon: ReactNode;
  prefetch?: boolean;
}) {
  return <Link data-ui-row href={href} prefetch={prefetch} className="flex min-h-14 items-center gap-3 border-t border-separator/70 px-4 py-3 first:border-t-0 first:rounded-t-card last:rounded-b-card active:bg-bg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2">
    <span className="shrink-0 text-accent">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-headline">{label}</span>
      {description && <span className="block text-micro text-muted">{description}</span>}
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted" />
  </Link>;
}
