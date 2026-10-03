"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Explanation } from "@/lib/statistics";
import type { HistoryChartData } from "@/lib/pricing/chart";
import { formatBRL } from "@/lib/pricing/money";
import { formatShortDate } from "@/lib/pricing/format";
import { Explain } from "./explain";

const C = {
  observed: "#1f1f1f",
  promo: "#1a7f4b",
  rolling: "#e5262e",
  median: "#e5262e",
  band: "#e5262e",
  extreme: "#9a9a9a",
};

export function HistoryChart({ data }: { data: HistoryChartData }) {
  const { reference: r, legend } = data;
  const values = data.points.map((p) => p.price);
  const lo = Math.min(...values, r.min ?? Infinity);
  const hi = Math.max(...values, r.max ?? -Infinity);
  const pad = Math.max(100, (hi - lo) * 0.08);

  if (data.points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl bg-surface text-sm text-muted">
        Sem observações neste período.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[data.start, data.end]}
              tickFormatter={(t: number) => formatShortDate(t).split(",")[0]}
              tick={{ fontSize: 11, fill: "#6b6b6b" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
              // Non-breaking space keeps "R$ 28" on one line.
              tickFormatter={(v: number) => `R$\u00a0${Math.round(v / 100)}`}
              tick={{ fontSize: 11, fill: "#6b6b6b" }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            {r.p25 !== null && r.p75 !== null && (
              <ReferenceArea y1={r.p25} y2={r.p75} fill={C.band} fillOpacity={0.08} stroke="none" />
            )}
            {r.median !== null && (
              <ReferenceLine y={r.median} stroke={C.median} strokeDasharray="6 4" strokeWidth={1.5} />
            )}
            {r.min !== null && <ReferenceLine y={r.min} stroke={C.extreme} strokeDasharray="2 3" />}
            {r.max !== null && <ReferenceLine y={r.max} stroke={C.extreme} strokeDasharray="2 3" />}
            <Line
              dataKey="rolling"
              type="monotone"
              stroke={C.rolling}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter
              dataKey="price"
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number; payload?: { promotion: boolean } }) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={props.payload?.promotion ? 3.5 : 2.5}
                  fill={props.payload?.promotion ? C.promo : C.observed}
                  fillOpacity={0.75}
                />
              )}
            />
            <Tooltip content={<PointTooltip />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <LegendItem swatch={<Dot color={C.observed} />} label="Preços observados" e={legend.observed} />
        <LegendItem swatch={<Dot color={C.promo} />} label="Com promoção" e={legend.observed} />
        <LegendItem swatch={<Bar color={C.rolling} />} label="Mediana móvel" e={legend.rolling} />
        <LegendItem swatch={<Bar color={C.median} dashed />} label="Mediana" e={legend.median} />
        <LegendItem swatch={<Band />} label="Faixa P25–P75" e={legend.band} />
        <LegendItem swatch={<Bar color={C.extreme} dashed />} label="Mínimo" e={legend.min} />
        <LegendItem swatch={<Bar color={C.extreme} dashed />} label="Máximo" e={legend.max} />
      </ul>
    </div>
  );
}

function LegendItem({ swatch, label, e }: { swatch: React.ReactNode; label: string; e: Explanation }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      <Explain explanation={e}>{label}</Explain>
    </li>
  );
}

const Dot = ({ color }: { color: string }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
);
const Bar = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <span
    className="inline-block w-4"
    style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
  />
);
const Band = () => <span className="inline-block h-3 w-4 rounded-sm bg-brand/15" />;

interface TooltipPayload {
  payload: { t: number; price: number; rolling: number; rollingCount: number; promotion: boolean };
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="text-muted">{formatShortDate(p.t)}</p>
      <p className="text-sm font-bold">{formatBRL(p.price)}</p>
      {p.promotion && <p className="text-good">com promoção</p>}
      <p className="text-muted">
        Mediana móvel: {formatBRL(p.rolling)} (n = {p.rollingCount})
      </p>
    </div>
  );
}
