import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/db/generated/client";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { dispatchAlertsForItems } from "@/lib/alerts/dispatch";
import { recordAnalyses } from "@/lib/db/analysis-store";
import type { PriceCollector, RawPriceObservation } from "./types";

export interface IngestResult {
  inserted: number;
  observationIds: string[];
  itemIds: string[];
  alertsFired: number;
}

/** Runs a collector and stores its output. */
export async function runCollector(collector: PriceCollector): Promise<IngestResult> {
  const raw = await collector.collect();
  return ingest(raw, collector.source);
}

/**
 * Append-only write path. Resolves merchant/item by name (creating them if new),
 * freezes effectivePrice, inserts observations, records analysis snapshots,
 * then evaluates alert rules.
 */
export async function ingest(
  raws: readonly RawPriceObservation[],
  source: string,
): Promise<IngestResult> {
  const prisma = db();
  const observationIds: string[] = [];
  const itemIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const r of raws) {
      // A stable external reference wins over the display name, which can change.
      const merchant =
        (r.merchant.externalRef &&
          (await tx.merchant.findFirst({
            where: { platform: r.merchant.platform, externalRef: r.merchant.externalRef },
          }))) ||
        (await tx.merchant.upsert({
          where: { platform_name: { platform: r.merchant.platform, name: r.merchant.name } },
          create: {
            name: r.merchant.name,
            platform: r.merchant.platform,
            externalRef: r.merchant.externalRef,
            city: r.merchant.city,
          },
          update: {},
        }));
      const item =
        (r.item.externalRef &&
          (await tx.item.findFirst({
            where: { merchantId: merchant.id, externalRef: r.item.externalRef },
          }))) ||
        (await tx.item.upsert({
          where: { merchantId_name: { merchantId: merchant.id, name: r.item.name } },
          create: {
            merchantId: merchant.id,
            name: r.item.name,
            description: r.item.description,
            externalRef: r.item.externalRef,
          },
          update: {},
        }));
      const eff = effectivePrice(r).value;
      const obs = await tx.priceObservation.create({
        data: {
          observedAt: r.observedAt,
          merchantId: merchant.id,
          itemId: item.id,
          listPrice: r.listPrice,
          currentPrice: r.currentPrice,
          deliveryFee: r.deliveryFee,
          serviceFee: r.serviceFee,
          discountValue: r.discountValue,
          effectivePrice: eff,
          promotionType: r.promotionType,
          deliveryEtaMin: r.deliveryEtaMin,
          deliveryEtaMax: r.deliveryEtaMax,
          source,
          sourceRef: r.sourceRef,
          rawPayload: (r.rawPayload ?? undefined) as Prisma.InputJsonValue | undefined,
          notes: r.notes,
        },
        select: { id: true },
      });
      observationIds.push(obs.id);
      itemIds.add(item.id);
    }
  }, { timeout: 120_000 });

  await recordAnalyses([...itemIds]);
  const alertsFired = await dispatchAlertsForItems([...itemIds]);
  return { inserted: observationIds.length, observationIds, itemIds: [...itemIds], alertsFired };
}
