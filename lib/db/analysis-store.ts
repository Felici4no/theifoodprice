import { db } from "./client";
import { ACTIVE_OBSERVATION } from "./queries";
import type { Prisma } from "./generated/client";
import { analyzePrices } from "@/lib/pricing/analysis";
import { WINDOW_KEYS, WINDOWS } from "@/lib/pricing/windows";

/**
 * Writes one PriceAnalysis snapshot per item and window.
 * Snapshots are an audit trail of what the system concluded at a given time;
 * pages compute fresh analyses because windows slide with time.
 */
export async function recordAnalyses(itemIds: readonly string[], now: Date = new Date()) {
  if (itemIds.length === 0) return 0;
  const maxWindow = Math.max(...WINDOW_KEYS.map((w) => WINDOWS[w]));
  const observations = await db().priceObservation.findMany({
    where: {
      itemId: { in: [...itemIds] },
      observedAt: { gt: new Date(now.getTime() - maxWindow), lte: now },
      ...ACTIVE_OBSERVATION,
    },
    select: { id: true, itemId: true, observedAt: true, effectivePrice: true },
  });

  const rows: Prisma.PriceAnalysisCreateManyInput[] = [];
  for (const itemId of itemIds) {
    const own = observations.filter((o) => o.itemId === itemId);
    for (const window of WINDOW_KEYS) {
      const a = analyzePrices(own, window, now);
      rows.push({
        itemId,
        window,
        computedAt: now,
        methodologyVersion: a.methodologyVersion,
        sampleSize: a.historySize,
        firstObservedAt: a.firstObservedAt ? new Date(a.firstObservedAt) : null,
        lastObservedAt: a.lastObservedAt ? new Date(a.lastObservedAt) : null,
        currentEffective: a.current?.effectivePrice ?? null,
        median: a.median.value,
        mean: a.mean.value,
        stdDev: a.stdDev.value,
        min: a.min.value,
        max: a.max.value,
        p10: a.p10.value,
        p25: a.p25.value,
        p75: a.p75.value,
        p90: a.p90.value,
        percentileRank: a.percentileRank.value,
        zScore: a.zScore.value,
        diffFromMedianPct: a.diffFromMedian.value,
        explanations: JSON.parse(
          JSON.stringify({
            median: a.median,
            mean: a.mean,
            stdDev: a.stdDev,
            min: a.min,
            max: a.max,
            p10: a.p10,
            p25: a.p25,
            p75: a.p75,
            p90: a.p90,
            percentileRank: a.percentileRank,
            zScore: a.zScore,
            diffFromMedian: a.diffFromMedian,
            isNewLow: a.isNewLow,
            label: a.label,
          }),
        ) as Prisma.InputJsonValue,
      });
    }
  }
  await db().priceAnalysis.createMany({ data: rows });
  return rows.length;
}
