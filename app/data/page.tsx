import Link from "next/link";
import { connection } from "next/server";
import { Explain } from "@/components/explain";
import { WindowTabs } from "@/components/window-tabs";
import { loadDataOverview } from "@/lib/db/queries";
import { assessDataQuality, QUALITY_TEXT, type DataQualityReport, type QualityLevel } from "@/lib/pricing/data-quality";
import { formatDateTime, formatDuration, formatValue } from "@/lib/pricing/format";
import { DEFAULT_WINDOW, isWindowKey } from "@/lib/pricing/windows";

const QUALITY_STYLE: Record<QualityLevel, string> = {
  good: "bg-good-soft text-good",
  fair: "bg-surface text-foreground",
  poor: "bg-warn-soft text-warn",
  none: "bg-brand-soft text-brand",
};

export default async function DataPage({ searchParams }: PageProps<"/data">) {
  await connection();
  const sp = await searchParams;
  const window = isWindowKey(sp.w) ? sp.w : DEFAULT_WINDOW;
  const now = new Date();
  const d = await loadDataOverview(now, window);

  const overall = assessDataQuality(d.timestamps.map((t) => t.observedAt), d.since, now, window);
  const perItem = d.items.map((item) => ({
    item,
    report: assessDataQuality(
      d.timestamps.filter((t) => t.itemId === item.id).map((t) => t.observedAt),
      d.since,
      now,
      window,
    ),
  }));
  const demoCount = d.bySource.find((s) => s.source === "demo-seed")?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dados</h1>
          <p className="text-sm text-muted">De onde vêm os números, e quanto confiar neles.</p>
        </div>
        <Link href="/data/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          + Registrar observação
        </Link>
      </div>

      {demoCount > 0 && (
        <p className="rounded-2xl bg-warn-soft p-3 text-sm text-warn">
          {demoCount} de {d.observationCount} observações são <strong>dados sintéticos de demonstração</strong>{" "}
          (fonte <code className="font-mono">demo-seed</code>). Não representam preços reais.
        </p>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Observações" value={d.observationCount.toLocaleString("pt-BR")} />
        <Kpi label="Estabelecimentos" value={String(d.merchantCount)} />
        <Kpi label="Itens" value={String(d.itemCount)} />
        <Kpi label="Correções" value={String(d.supersededCount)} hint="observações que substituem outras" />
        <div className="col-span-2 rounded-2xl bg-surface p-3 sm:col-span-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Cobertura total</p>
          <p className="mt-1 text-sm font-semibold">
            {formatDateTime(d.firstObservedAt)} → {formatDateTime(d.lastObservedAt)}
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            {d.bySource.map((s) => (
              <span key={s.source} className="rounded-full bg-background px-2.5 py-1">
                <span className="font-mono">{s.source}</span>: {s.count}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Qualidade na janela</h2>
          <WindowTabs current={window} hrefFor={(w) => `/data?w=${w}`} />
        </div>
        <QualitySummary r={overall} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Por item</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">n</th>
                <th className="px-3 py-2 text-right">Frequência</th>
                <th className="px-3 py-2 text-right">Cobertura</th>
                <th className="px-3 py-2 text-right">Lacunas</th>
                <th className="px-3 py-2">Qualidade</th>
                <th className="px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {perItem.map(({ item, report: r }) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/history?item=${item.id}&w=${window}`} className="font-semibold">
                      {item.name}
                    </Link>
                    <span className="block text-xs text-muted">{item.merchant.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.observationCount}</td>
                  <td className="px-3 py-2 text-right">
                    <Explain explanation={r.medianIntervalMs.explanation}>{formatDuration(r.medianIntervalMs.value)}</Explain>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Explain explanation={r.dayCoverage.explanation}>
                      {formatValue(r.dayCoverage.value, "percent")}
                    </Explain>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Explain explanation={r.gaps.explanation}>{r.gaps.value.length}</Explain>
                  </td>
                  <td className="px-3 py-2">
                    <QualityBadge r={r} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{formatDateTime(r.lastObservedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function QualityBadge({ r }: { r: DataQualityReport }) {
  return (
    <Explain
      explanation={r.quality.explanation}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold no-underline ${QUALITY_STYLE[r.quality.value]}`}
    >
      {QUALITY_TEXT[r.quality.value]}
    </Explain>
  );
}

function QualitySummary({ r }: { r: DataQualityReport }) {
  return (
    <div className="space-y-3 rounded-3xl border border-border p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-muted">Qualidade</p>
          <QualityBadge r={r} />
        </div>
        <div>
          <p className="text-[11px] text-muted">Observações</p>
          <p className="font-semibold tabular-nums">{r.observationCount}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Frequência de coleta</p>
          <p className="font-semibold">
            <Explain explanation={r.medianIntervalMs.explanation}>{formatDuration(r.medianIntervalMs.value)}</Explain>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Cobertura temporal</p>
          <p className="font-semibold">
            <Explain explanation={r.dayCoverage.explanation}>{formatValue(r.dayCoverage.value, "percent")}</Explain>
          </p>
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] text-muted">
          <Explain explanation={r.gaps.explanation}>Períodos sem dados ({r.gaps.value.length})</Explain>
        </p>
        {r.gaps.value.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma lacuna acima do limiar.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {r.gaps.value.slice(0, 8).map((g) => (
              <li key={g.from} className="flex justify-between gap-2 rounded-xl bg-surface px-3 py-1.5">
                <span>
                  {formatDateTime(g.from)} → {formatDateTime(g.to)}
                </span>
                <span className="font-semibold">{formatDuration(g.durationMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
