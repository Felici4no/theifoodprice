import type { Explained } from "@/lib/statistics";
import { formatSignedPercent, formatValue } from "@/lib/pricing/format";
import { Explain } from "./explain";

/** A formatted number that opens its own explanation. */
export function ExplainedValue({
  metric,
  signed = false,
  className = "",
}: {
  metric: Explained<number | null>;
  /** Show percentages with an explicit + / − sign. */
  signed?: boolean;
  className?: string;
}) {
  const { value, explanation } = metric;
  const text =
    signed && explanation.unit === "percent"
      ? formatSignedPercent(value)
      : formatValue(value, explanation.unit);
  return (
    <Explain explanation={explanation} className={`tabular-nums ${className}`}>
      {text}
    </Explain>
  );
}

/** Small labelled statistic used in grids. */
export function Stat({
  label,
  metric,
  signed,
}: {
  label: string;
  metric: Explained<number | null>;
  signed?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold">
        <ExplainedValue metric={metric} signed={signed} />
      </p>
    </div>
  );
}
