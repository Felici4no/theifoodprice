import Link from "next/link";
import { connection } from "next/server";
import { Explain } from "@/components/explain";
import { Stat } from "@/components/explained-value";
import { HistoryChart } from "@/components/history-chart";
import { ItemSelect } from "@/components/item-select";
import { PriceLabelBadge } from "@/components/price-label";
import { WindowTabs } from "@/components/window-tabs";
import { listItems, loadItemAnalyses } from "@/lib/db/queries";
import { buildHistoryChart } from "@/lib/pricing/chart";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { formatDateTime } from "@/lib/pricing/format";
import { formatBRL } from "@/lib/pricing/money";
import { DEFAULT_WINDOW, isWindowKey } from "@/lib/pricing/windows";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await connection();
  const sp = await searchParams;
  const window = isWindowKey(sp.w) ? sp.w : DEFAULT_WINDOW;
  const items = await listItems();

  if (items.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-6 text-center text-sm">
        Nenhum item ainda. <Link className="font-semibold text-brand" href="/data/new">Registrar observação</Link>
      </div>
    );
  }

  const itemId = typeof sp.item === "string" && items.some((i) => i.id === sp.item) ? sp.item : items[0].id;
  const now = new Date();
  const [data] = await loadItemAnalyses(window, now, { itemId });
  const a = data.analysis;
  const chart = buildHistoryChart(a, data.observations, window, now);
  const recent = [...data.observations].reverse().slice(0, 30);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Histórico</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ItemSelect
            items={items.map((i) => ({ id: i.id, label: `${i.name} · ${i.merchant.name}` }))}
            value={itemId}
            window={window}
            basePath="/history"
          />
          <WindowTabs current={window} hrefFor={(w) => `/history?item=${itemId}&w=${w}`} />
        </div>
      </div>

      <section className="rounded-3xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {chart.points.length} observações em {window}
          </p>
          <PriceLabelBadge label={a.label} />
        </div>
        <HistoryChart data={chart} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Estatísticas da janela</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={`Mediana ${window}`} metric={a.median} />
          <Stat label="Diferença vs mediana" metric={a.diffFromMedian} signed />
          <Stat label="Percentil atual" metric={a.percentileRank} />
          <Stat label="Z-score" metric={a.zScore} />
          <Stat label="Média" metric={a.mean} />
          <Stat label="Desvio padrão" metric={a.stdDev} />
          <Stat label="Mínimo" metric={a.min} />
          <Stat label="Máximo" metric={a.max} />
          <Stat label="P10" metric={a.p10} />
          <Stat label="P25" metric={a.p25} />
          <Stat label="P75" metric={a.p75} />
          <Stat label="P90" metric={a.p90} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          Observações brutas (últimas {recent.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Observado em</th>
                <th className="px-3 py-2 text-right">Lista</th>
                <th className="px-3 py-2 text-right">Atual</th>
                <th className="px-3 py-2 text-right">Entrega</th>
                <th className="px-3 py-2 text-right">Serviço</th>
                <th className="px-3 py-2 text-right">Desconto</th>
                <th className="px-3 py-2 text-right">Efetivo</th>
                <th className="px-3 py-2">Promo</th>
                <th className="px-3 py-2">ETA</th>
                <th className="px-3 py-2">Fonte</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {recent.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(o.observedAt)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(o.listPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(o.currentPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(o.deliveryFee)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(o.serviceFee)}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(o.discountValue)}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    <Explain explanation={{ ...effectivePrice(o).explanation, lastUpdatedAt: o.observedAt.toISOString() }}>
                      {formatBRL(o.effectivePrice)}
                    </Explain>
                  </td>
                  <td className="px-3 py-2 text-muted">{o.promotionType ?? "—"}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">
                    {o.deliveryEtaMin ? `${o.deliveryEtaMin}–${o.deliveryEtaMax ?? "?"} min` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">{o.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
