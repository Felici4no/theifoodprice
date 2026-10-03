import Link from "next/link";
import type { ItemAnalysis } from "@/lib/db/queries";
import { formatAgo, formatDateTime } from "@/lib/pricing/format";
import { Explain } from "./explain";
import { ExplainedValue } from "./explained-value";
import { PriceLabelBadge } from "./price-label";

export function PriceCard({ data, now }: { data: ItemAnalysis; now: Date }) {
  const { item, analysis: a, currentPrice } = data;
  const diff = a.diffFromMedian.value;

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="space-y-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{item.name}</h2>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="truncate">{item.merchantName}</span>
            {item.platform === "demo" && (
              <span className="shrink-0 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">
                demo
              </span>
            )}
          </p>
        </div>
        <PriceLabelBadge label={a.label} />
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Preço efetivo atual</p>
          <p className="text-3xl font-extrabold tracking-tight">
            {currentPrice ? <ExplainedValue metric={currentPrice} /> : <span className="text-muted">—</span>}
          </p>
        </div>
        {diff !== null && (
          <p
            className={`rounded-full px-2.5 py-1 text-sm font-bold ${
              diff < 0 ? "bg-good-soft text-good" : diff > 0 ? "bg-brand-soft text-brand" : "bg-surface"
            }`}
          >
            <ExplainedValue metric={a.diffFromMedian} signed />
            <span className="ml-1 text-xs font-medium">vs mediana</span>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-muted">Mediana {a.window}</dt>
          <dd className="font-semibold">
            <ExplainedValue metric={a.median} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Percentil</dt>
          <dd className="font-semibold">
            <ExplainedValue metric={a.percentileRank} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Amostra</dt>
          <dd className="font-semibold">
            <Explain explanation={a.median.explanation}>n = {a.historySize}</Explain>
          </dd>
        </div>
      </dl>

      <footer className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span title={formatDateTime(data.lastObservedAt)}>
          Última observação {formatAgo(data.lastObservedAt, now)}
        </span>
        <Link
          href={`/history?item=${item.id}&w=${a.window}`}
          className="font-semibold text-brand"
        >
          Ver histórico →
        </Link>
      </footer>
    </article>
  );
}
