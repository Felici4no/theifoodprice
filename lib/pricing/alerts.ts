import type { Explained } from "@/lib/statistics";
import type { PriceAnalysisResult } from "./analysis";

export type AlertType =
  | "ABSOLUTE_PRICE"
  | "PERCENTILE"
  | "BELOW_MEDIAN_PCT"
  | "NEW_HISTORICAL_LOW";

export const ALERT_TYPE_TEXT: Record<AlertType, string> = {
  ABSOLUTE_PRICE: "Preço abaixo de um valor",
  PERCENTILE: "Percentil abaixo de um limite",
  BELOW_MEDIAN_PCT: "Percentual abaixo da mediana",
  NEW_HISTORICAL_LOW: "Nova mínima histórica",
};

export interface AlertRuleInput {
  type: AlertType;
  thresholdCents?: number | null;
  thresholdPercent?: number | null;
  minSampleSize: number;
  cooldownMinutes: number;
  lastTriggeredAt?: Date | null;
  active: boolean;
}

export type AlertDecision = Explained<boolean> & {
  /** Machine-readable reason when not fired. */
  blockedBy?: "inactive" | "no-current" | "sample" | "cooldown" | "condition" | "config";
};

/**
 * Pure evaluation of one rule against one analysis. No I/O.
 * Statistical rules require at least `minSampleSize` prior observations.
 */
export function evaluateAlert(
  rule: AlertRuleInput,
  analysis: PriceAnalysisResult,
  now: Date,
): AlertDecision {
  const current = analysis.current?.effectivePrice ?? null;
  const n = analysis.historySize;
  const base = {
    name: ALERT_TYPE_TEXT[rule.type],
    unit: "number" as const,
    sampleSize: n,
    window: analysis.window,
    ...(analysis.lastObservedAt ? { lastUpdatedAt: analysis.lastObservedAt } : {}),
  };

  const decide = (
    fired: boolean,
    formula: string,
    variables: Explained<unknown>["explanation"]["variables"],
    variableUnits: Explained<unknown>["explanation"]["variableUnits"],
    blockedBy?: AlertDecision["blockedBy"],
    note?: string,
  ): AlertDecision => ({
    value: fired,
    ...(blockedBy ? { blockedBy } : {}),
    explanation: {
      ...base,
      description: fired ? "Condição satisfeita." : "Condição não satisfeita.",
      formula,
      variables,
      variableUnits,
      notes: note ? [note] : [],
    },
  });

  if (!rule.active) return decide(false, "—", {}, {}, "inactive", "Regra desativada.");
  if (current === null)
    return decide(false, "—", {}, {}, "no-current", "Sem observação na janela.");

  if (rule.lastTriggeredAt) {
    const elapsedMin = (now.getTime() - rule.lastTriggeredAt.getTime()) / 60_000;
    if (elapsedMin < rule.cooldownMinutes) {
      return decide(
        false,
        "minutos desde o último disparo ≥ cooldown",
        { elapsedMinutes: Math.floor(elapsedMin), cooldownMinutes: rule.cooldownMinutes },
        {},
        "cooldown",
        "Em período de espera para evitar alertas repetidos.",
      );
    }
  }

  const needsHistory = rule.type !== "ABSOLUTE_PRICE";
  if (needsHistory && n < rule.minSampleSize) {
    return decide(
      false,
      "n ≥ amostra mínima",
      { n, minSampleSize: rule.minSampleSize },
      { n: "count", minSampleSize: "count" },
      "sample",
      "Histórico insuficiente para um alerta estatístico.",
    );
  }

  switch (rule.type) {
    case "ABSOLUTE_PRICE": {
      if (rule.thresholdCents == null) return decide(false, "—", {}, {}, "config", "Sem limite configurado.");
      const fired = current <= rule.thresholdCents;
      return decide(
        fired,
        "current ≤ threshold",
        { current, threshold: rule.thresholdCents },
        { current: "cents", threshold: "cents" },
        fired ? undefined : "condition",
      );
    }
    case "PERCENTILE": {
      const rank = analysis.percentileRank.value;
      if (rule.thresholdPercent == null || rank === null)
        return decide(false, "—", {}, {}, "config", "Percentil indisponível ou limite ausente.");
      const fired = rank <= rule.thresholdPercent;
      return decide(
        fired,
        "percentil ≤ limite",
        { percentileRank: rank, threshold: rule.thresholdPercent },
        { percentileRank: "percent", threshold: "percent" },
        fired ? undefined : "condition",
      );
    }
    case "BELOW_MEDIAN_PCT": {
      const diff = analysis.diffFromMedian.value;
      if (rule.thresholdPercent == null || diff === null)
        return decide(false, "—", {}, {}, "config", "Mediana indisponível ou limite ausente.");
      const fired = -diff >= rule.thresholdPercent;
      return decide(
        fired,
        "−(diferença vs mediana) ≥ limite",
        { diffFromMedian: diff, threshold: rule.thresholdPercent },
        { diffFromMedian: "percent", threshold: "percent" },
        fired ? undefined : "condition",
      );
    }
    case "NEW_HISTORICAL_LOW": {
      const isLow = analysis.isNewLow.value;
      const histMin = analysis.min.value;
      return decide(
        isLow === true,
        "current < min(histórico)",
        { current, historicalMin: histMin },
        { current: "cents", historicalMin: "cents" },
        isLow ? undefined : "condition",
      );
    }
  }
}
