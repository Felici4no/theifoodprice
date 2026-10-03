import Link from "next/link";
import { WINDOW_KEYS, type WindowKey } from "@/lib/pricing/windows";

export function WindowTabs({
  current,
  hrefFor,
}: {
  current: WindowKey;
  hrefFor: (w: WindowKey) => string;
}) {
  return (
    <div className="inline-flex rounded-full bg-surface p-1" role="tablist" aria-label="Período">
      {WINDOW_KEYS.map((w) => (
        <Link
          key={w}
          href={hrefFor(w)}
          role="tab"
          aria-selected={w === current}
          scroll={false}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
            w === current ? "bg-background text-brand shadow-sm" : "text-muted"
          }`}
        >
          {w}
        </Link>
      ))}
    </div>
  );
}
