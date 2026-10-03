import {
  contextFields,
  sampleNotes,
  type Explained,
  type StatContext,
} from "./explanation";

export function sortAscending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export interface QuantileParts {
  value: number;
  /** h = (n − 1) · p, zero-based fractional rank. */
  h: number;
  lowerIndex: number;
  upperIndex: number;
  lower: number;
  upper: number;
}

/**
 * Linear-interpolation quantile (Hyndman & Fan type 7), identical to
 * numpy.percentile(method="linear") and Excel PERCENTILE.INC.
 * `sorted` must be ascending and non-empty; p ∈ [0, 1].
 */
export function quantileSorted(sorted: readonly number[], p: number): QuantileParts {
  if (sorted.length === 0) throw new RangeError("Empty sample");
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0,1], got ${p}`);
  const h = (sorted.length - 1) * p;
  const lowerIndex = Math.floor(h);
  const upperIndex = Math.ceil(h);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  return {
    value: lower + (h - lowerIndex) * (upper - lower),
    h,
    lowerIndex,
    upperIndex,
    lower,
    upper,
  };
}

/** k-th percentile (k ∈ [0, 100]) with explanation. */
export function percentile(
  values: readonly number[],
  k: number,
  ctx?: StatContext,
): Explained<number | null> {
  for (const v of values) if (!Number.isFinite(v)) throw new TypeError(`Non-finite value: ${v}`);
  const n = values.length;
  const unit = ctx?.unit ?? "number";
  const base = {
    name: `P${k}`,
    description: `Preço abaixo do qual estão ${k}% das observações (percentil ${k}).`,
    formula:
      "h = (n − 1) × p;  P = x₍⌊h⌋₎ + (h − ⌊h⌋) × (x₍⌈h⌉₎ − x₍⌊h⌋₎)  (ordenado, índice a partir de 0)",
    unit,
    sampleSize: n,
    ...contextFields(ctx),
    notes: sampleNotes(n),
  };
  if (n === 0) {
    return { value: null, explanation: { ...base, variables: { n, p: k / 100 } } };
  }
  const q = quantileSorted(sortAscending(values), k / 100);
  return {
    value: q.value,
    explanation: {
      ...base,
      variables: {
        n,
        p: k / 100,
        h: q.h,
        lowerValue: q.lower,
        upperValue: q.upper,
      },
      variableUnits: {
        n: "count",
        lowerValue: unit,
        upperValue: unit,
      },
    },
  };
}

export const p10 = (v: readonly number[], c?: StatContext) => percentile(v, 10, c);
export const p25 = (v: readonly number[], c?: StatContext) => percentile(v, 25, c);
export const p50 = (v: readonly number[], c?: StatContext) => percentile(v, 50, c);
export const p75 = (v: readonly number[], c?: StatContext) => percentile(v, 75, c);
export const p90 = (v: readonly number[], c?: StatContext) => percentile(v, 90, c);

/**
 * Percentile rank of `x` within `values`, in percent.
 * Mid-rank definition: (below + 0.5 × equal) / n × 100,
 * so ties are split evenly and the result is never 0 or 100 for a member.
 */
export function percentileRank(
  x: number,
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  if (!Number.isFinite(x)) throw new TypeError(`Non-finite value: ${x}`);
  const n = values.length;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) throw new TypeError(`Non-finite value: ${v}`);
    if (v < x) below++;
    else if (v === x) equal++;
  }
  const unit = ctx?.unit ?? "number";
  return {
    value: n === 0 ? null : ((below + 0.5 * equal) / n) * 100,
    explanation: {
      name: "Percentil do preço",
      description:
        "Posição do preço atual no histórico: 7% significa que só cerca de 7% das observações foram mais baratas.",
      formula: "(abaixo + 0,5 × iguais) / n × 100",
      variables: { x, below, equal, n },
      variableUnits: { x: unit, below: "count", equal: "count", n: "count" },
      unit: "percent",
      sampleSize: n,
      ...contextFields(ctx),
      notes: sampleNotes(n),
    },
  };
}
