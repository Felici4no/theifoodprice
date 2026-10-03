import { z } from "zod";

const cents = z.number().int().nonnegative();

/**
 * What a collector produces: one price sighting, exactly as seen.
 * Merchants and items are identified by name (+ platform); IDs are resolved at ingestion.
 */
export const rawPriceObservationSchema = z
  .object({
    observedAt: z.coerce.date(),
    merchant: z.object({
      name: z.string().trim().min(1),
      platform: z.string().trim().min(1).default("manual"),
      externalRef: z.string().trim().min(1).optional(),
      city: z.string().trim().min(1).optional(),
    }),
    item: z.object({
      name: z.string().trim().min(1),
      description: z.string().trim().min(1).optional(),
      externalRef: z.string().trim().min(1).optional(),
    }),
    listPrice: cents,
    currentPrice: cents,
    deliveryFee: cents.default(0),
    serviceFee: cents.default(0),
    discountValue: cents.default(0),
    promotionType: z.string().trim().min(1).optional(),
    deliveryEtaMin: z.number().int().positive().optional(),
    deliveryEtaMax: z.number().int().positive().optional(),
    sourceRef: z.string().optional(),
    rawPayload: z.unknown().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (o) =>
      o.deliveryEtaMin === undefined ||
      o.deliveryEtaMax === undefined ||
      o.deliveryEtaMin <= o.deliveryEtaMax,
    { message: "deliveryEtaMin must be ≤ deliveryEtaMax", path: ["deliveryEtaMax"] },
  );

export type RawPriceObservationInput = z.input<typeof rawPriceObservationSchema>;
export type RawPriceObservation = z.output<typeof rawPriceObservationSchema>;

/**
 * A source of price observations. Implementations must only use
 * legitimate, documented data sources.
 */
export interface PriceCollector {
  /** Stored on every observation as `source`. */
  readonly source: string;
  collect(): Promise<RawPriceObservation[]>;
}
