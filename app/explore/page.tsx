import Link from "next/link";
import { connection } from "next/server";
import { ExplainedValue } from "@/components/explained-value";
import { PriceLabelBadge } from "@/components/price-label";
import { WindowTabs } from "@/components/window-tabs";
import { loadItemAnalyses, type ItemAnalysis } from "@/lib/db/queries";
import { DEFAULT_WINDOW, isWindowKey } from "@/lib/pricing/windows";

const SORTS = {
  percentile: { label: "Percentil", get: (d: ItemAnalysis) => d.analysis.percentileRank.value },
  diff: { label: "Vs mediana", get: (d: ItemAnalysis) => d.analysis.diffFromMedian.value },
  z: { label: "Z-score", get: (d: ItemAnalysis) => d.analysis.zScore.value },
  n: { label: "Amostra", get: (d: ItemAnalysis) => -d.analysis.historySize },
} as const;
type SortKey = keyof typeof SORTS;

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  await connection();
  const sp = await searchParams;
  const window = isWindowKey(sp.w) ? sp.w : DEFAULT_WINDOW;
  const sort: SortKey = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as SortKey) : "percentile";
  const now = new Date();
  const rows = await loadItemAnalyses(window, now);

  // Items without a value always go last; never ranked as if they were cheap.
  const get = SORTS[sort].get;
  rows.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === null) return vb === null ? 0 : 1;
    if (vb === null) return -1;
    return va - vb;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Explorar</h1>
          <p className="text-sm text-muted">
            Todos os itens ordenados pela posição do preço atual em relação ao próprio histórico.
          </p>
        </div>
        <WindowTabs current={window} hrefFor={(w) => `/explore?w=${w}&sort=${sort}`} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="py-1 text-muted">Ordenar por</span>
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <Link
            key={k}
            href={`/explore?w=${window}&sort=${k}`}
            className={`rounded-full px-3 py-1 font-semibold ${
              k === sort ? "bg-brand text-white" : "bg-surface text-muted"
            }`}
          >
            {SORTS[k].label}
          </Link>
        ))}
      </div>

      <ol className="divide-y divide-border rounded-3xl border border-border">
        {rows.map((d, i) => (
          <li key={d.item.id} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 sm:grid-cols-[auto_1fr_repeat(4,6.5rem)] sm:items-center">
            <span className="row-span-2 w-6 text-right text-sm font-bold text-muted sm:row-span-1">{i + 1}</span>
            <div className="min-w-0">
              <Link href={`/history?item=${d.item.id}&w=${window}`} className="block truncate font-bold">
                {d.item.name}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {d.item.merchantName}
                <PriceLabelBadge label={d.analysis.label} />
              </span>
            </div>
            <dl className="col-start-2 grid grid-cols-4 gap-2 text-sm sm:contents">
              <Cell label="Atual">
                {d.currentPrice ? <ExplainedValue metric={d.currentPrice} /> : "—"}
              </Cell>
              <Cell label="Vs mediana">
                <ExplainedValue metric={d.analysis.diffFromMedian} signed />
              </Cell>
              <Cell label="Percentil">
                <ExplainedValue metric={d.analysis.percentileRank} />
              </Cell>
              <Cell label="Z-score">
                <ExplainedValue metric={d.analysis.zScore} />
              </Cell>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:text-right">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
