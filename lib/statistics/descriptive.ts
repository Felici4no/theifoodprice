import {
  contextFields,
  sampleNotes,
  type Explained,
  type StatContext,
} from "./explanation";
import { sortAscending } from "./quantile";

function assertFinite(values: readonly number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new TypeError(`Non-finite value in sample: ${v}`);
    }
  }
}

export function mean(
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite(values);
  const n = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const unit = ctx?.unit ?? "number";
  return {
    value: n === 0 ? null : sum / n,
    explanation: {
      name: "Média",
      description:
        "Soma de todos os preços dividida pelo número de observações. Sensível a valores extremos.",
      formula: "Σxᵢ / n",
      variables: { sum, n },
      variableUnits: { sum: unit, n: "count" },
      unit,
      sampleSize: n,
      ...contextFields(ctx),
      notes: sampleNotes(n),
    },
  };
}

export function median(
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite(values);
  const sorted = sortAscending(values);
  const n = sorted.length;
  const unit = ctx?.unit ?? "number";
  const base = {
    name: "Mediana",
    description:
      "Valor do meio quando os preços são ordenados: metade das observações está abaixo, metade acima. Pouco sensível a promoções ou picos isolados.",
    unit,
    sampleSize: n,
    ...contextFields(ctx),
    notes: sampleNotes(n),
  };

  if (n === 0) {
    return {
      value: null,
      explanation: { ...base, formula: "x₍ₙ₊₁₎/₂ (ordenado)", variables: { n } },
    };
  }
  if (n % 2 === 1) {
    const mid = (n - 1) / 2;
    return {
      value: sorted[mid],
      explanation: {
        ...base,
        formula: "n ímpar: x₍(n+1)/2₎ do conjunto ordenado",
        variables: { n, position: mid + 1, middle: sorted[mid] },
        variableUnits: { n: "count", position: "count", middle: unit },
      },
    };
  }
  const lo = sorted[n / 2 - 1];
  const hi = sorted[n / 2];
  return {
    value: (lo + hi) / 2,
    explanation: {
      ...base,
      formula: "n par: (x₍n/2₎ + x₍n/2+1₎) / 2 do conjunto ordenado",
      variables: { n, lowerMiddle: lo, upperMiddle: hi },
      variableUnits: { n: "count", lowerMiddle: unit, upperMiddle: unit },
    },
  };
}

/** Sample standard deviation (Bessel's correction, n − 1). */
export function standardDeviation(
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite(values);
  const n = values.length;
  const unit = ctx?.unit ?? "number";
  const m = n === 0 ? null : values.reduce((a, v) => a + v, 0) / n;
  const sumSq =
    m === null ? null : values.reduce((a, v) => a + (v - m) ** 2, 0);
  const notes = sampleNotes(n);
  if (n === 1) notes.push("Com uma única observação o desvio padrão é indefinido.");
  return {
    value: n < 2 || sumSq === null ? null : Math.sqrt(sumSq / (n - 1)),
    explanation: {
      name: "Desvio padrão",
      description:
        "Dispersão típica dos preços em torno da média. Desvio padrão amostral (divide por n − 1).",
      formula: "√( Σ(xᵢ − x̄)² / (n − 1) )",
      variables: { mean: m, sumSquaredDeviations: sumSq, n },
      variableUnits: { mean: unit, sumSquaredDeviations: "number", n: "count" },
      unit,
      sampleSize: n,
      ...contextFields(ctx),
      notes,
    },
  };
}

export function min(
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite(values);
  const n = values.length;
  const unit = ctx?.unit ?? "number";
  const value = n === 0 ? null : values.reduce((a, v) => (v < a ? v : a));
  return {
    value,
    explanation: {
      name: "Mínimo",
      description: "Menor preço observado na janela.",
      formula: "min(x₁, …, xₙ)",
      variables: { min: value, n },
      variableUnits: { min: unit, n: "count" },
      unit,
      sampleSize: n,
      ...contextFields(ctx),
      notes: sampleNotes(n),
    },
  };
}

export function max(
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite(values);
  const n = values.length;
  const unit = ctx?.unit ?? "number";
  const value = n === 0 ? null : values.reduce((a, v) => (v > a ? v : a));
  return {
    value,
    explanation: {
      name: "Máximo",
      description: "Maior preço observado na janela.",
      formula: "max(x₁, …, xₙ)",
      variables: { max: value, n },
      variableUnits: { max: unit, n: "count" },
      unit,
      sampleSize: n,
      ...contextFields(ctx),
      notes: sampleNotes(n),
    },
  };
}

/** How many standard deviations `x` is from the sample mean. */
export function zScore(
  x: number,
  values: readonly number[],
  ctx?: StatContext,
): Explained<number | null> {
  assertFinite([x, ...values]);
  const unit = ctx?.unit ?? "number";
  const m = mean(values).value;
  const sd = standardDeviation(values).value;
  const n = values.length;
  const notes = sampleNotes(n);
  if (sd === 0) notes.push("Todos os preços são iguais (desvio padrão 0): z-score indefinido.");
  notes.push(
    "Preços raramente seguem distribuição normal; use o z-score como medida relativa, não como probabilidade.",
  );
  return {
    value: m === null || sd === null || sd === 0 ? null : (x - m) / sd,
    explanation: {
      name: "Z-score",
      description:
        "Quantos desvios padrão o preço atual está acima (positivo) ou abaixo (negativo) da média.",
      formula: "(x − x̄) / s",
      variables: { x, mean: m, standardDeviation: sd },
      variableUnits: { x: unit, mean: unit, standardDeviation: unit },
      unit: "zscore",
      sampleSize: n,
      ...contextFields(ctx),
      notes,
    },
  };
}

/** Relative change from `reference` to `current`, in percent. */
export function priceChangePercentage(
  current: number,
  reference: number,
  ctx?: StatContext & {
    name?: string;
    description?: string;
    referenceLabel?: string;
    sampleSize?: number;
  },
): Explained<number | null> {
  assertFinite([current, reference]);
  const unit = ctx?.unit ?? "number";
  const refKey = ctx?.referenceLabel ?? "reference";
  const notes: string[] = [];
  if (reference === 0) notes.push("Referência igual a zero: variação indefinida.");
  return {
    value: reference === 0 ? null : ((current - reference) / reference) * 100,
    explanation: {
      name: ctx?.name ?? "Variação percentual",
      description:
        ctx?.description ??
        "Diferença relativa entre o preço atual e a referência. Negativo = mais barato que a referência.",
      formula: `(current − ${refKey}) / ${refKey} × 100`,
      variables: { current, [refKey]: reference },
      variableUnits: { current: unit, [refKey]: unit },
      unit: "percent",
      sampleSize: ctx?.sampleSize ?? 1,
      ...contextFields(ctx),
      notes,
    },
  };
}

