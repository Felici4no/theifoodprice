import { db } from "./client";
import { analyzePrices, type PriceAnalysisResult } from "@/lib/pricing/analysis";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { WINDOWS, type WindowKey } from "@/lib/pricing/windows";
import type { Explained } from "@/lib/statistics";

/** Corrections replace the rows they supersede in every analysis. */
export const ACTIVE_OBSERVATION = { supersededBy: { is: null } } as const;

export interface ObservationRow {
  id: string;
  observedAt: Date;
  collectedAt: Date;
  listPrice: number;
  currentPrice: number;
  deliveryFee: number;
  serviceFee: number;
  discountValue: number;
  effectivePrice: number;
  promotionType: string | null;
  deliveryEtaMin: number | null;
  deliveryEtaMax: number | null;
  source: string;
}

export interface ItemAnalysis {
  item: { id: string; name: string; merchantName: string; platform: string };
  analysis: PriceAnalysisResult;
  /** Breakdown of the current effective price. */
  currentPrice: Explained<number> | null;
  currentObservation: ObservationRow | null;
  /** Most recent observation regardless of window. */
  lastObservedAt: string | null;
  observations: ObservationRow[];
}

const OBS_SELECT = {
  id: true,
  observedAt: true,
  collectedAt: true,
  listPrice: true,
  currentPrice: true,
  deliveryFee: true,
  serviceFee: true,
  discountValue: true,
  effectivePrice: true,
  promotionType: true,
  deliveryEtaMin: true,
  deliveryEtaMax: true,
  source: true,
} as const;

export async function loadItemAnalyses(
  window: WindowKey,
  now: Date,
  opts: { itemId?: string; trackedOnly?: boolean } = {},
): Promise<ItemAnalysis[]> {
  const since = new Date(now.getTime() - WINDOWS[window]);
  const items = await db().item.findMany({
    where: {
      ...(opts.itemId ? { id: opts.itemId } : {}),
      ...(opts.trackedOnly ? { tracked: true } : {}),
    },
    include: {
      merchant: true,
      observations: {
        where: { observedAt: { gt: since, lte: now }, ...ACTIVE_OBSERVATION },
        orderBy: { observedAt: "asc" },
        select: OBS_SELECT,
      },
    },
    orderBy: [{ merchant: { name: "asc" } }, { name: "asc" }],
  });

  const latest = await db().priceObservation.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) }, ...ACTIVE_OBSERVATION },
    _max: { observedAt: true },
  });
  const latestByItem = new Map(latest.map((l) => [l.itemId, l._max.observedAt]));

  return items.map((it) => {
    const analysis = analyzePrices(it.observations, window, now);
    const currentObservation =
      it.observations.find((o) => o.id === analysis.current?.id) ?? null;
    return {
      item: {
        id: it.id,
        name: it.name,
        merchantName: it.merchant.name,
        platform: it.merchant.platform,
      },
      analysis,
      currentPrice: currentObservation ? withObservedAt(currentObservation) : null,
      currentObservation,
      lastObservedAt: latestByItem.get(it.id)?.toISOString() ?? null,
      observations: it.observations,
    };
  });
}

function withObservedAt(o: ObservationRow): Explained<number> {
  const e = effectivePrice(o);
  return {
    ...e,
    explanation: { ...e.explanation, lastUpdatedAt: o.observedAt.toISOString() },
  };
}

export async function listItems() {
  return db().item.findMany({
    include: { merchant: true },
    orderBy: [{ merchant: { name: "asc" } }, { name: "asc" }],
  });
}

export async function loadDataOverview(now: Date, window: WindowKey) {
  const prisma = db();
  const since = new Date(now.getTime() - WINDOWS[window]);
  const [observationCount, merchantCount, itemCount, bySource, range, timestamps, items, supersededCount] =
    await Promise.all([
      prisma.priceObservation.count(),
      prisma.merchant.count(),
      prisma.item.count(),
      prisma.priceObservation.groupBy({ by: ["source"], _count: { _all: true } }),
      prisma.priceObservation.aggregate({ _min: { observedAt: true }, _max: { observedAt: true } }),
      prisma.priceObservation.findMany({
        where: { observedAt: { gt: since, lte: now }, ...ACTIVE_OBSERVATION },
        select: { itemId: true, observedAt: true },
        orderBy: { observedAt: "asc" },
      }),
      prisma.item.findMany({ include: { merchant: true }, orderBy: { name: "asc" } }),
      prisma.priceObservation.count({ where: { supersedesId: { not: null } } }),
    ]);
  return {
    observationCount,
    merchantCount,
    itemCount,
    supersededCount,
    bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    firstObservedAt: range._min.observedAt,
    lastObservedAt: range._max.observedAt,
    since,
    timestamps,
    items,
  };
}
