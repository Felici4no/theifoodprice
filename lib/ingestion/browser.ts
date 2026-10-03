import { z } from "zod";
import { MIN_EXTRACTION_CONFIDENCE } from "./browser-contract";
import type { RawPriceObservation } from "./types";

/**
 * Contract between the browser extension and POST /api/collect/browser.
 * The extension sends what it read from the page DOM; this module alone decides
 * how that becomes a RawPriceObservation. Monetary values are integer cents.
 */

export { BROWSER_SOURCE, MIN_EXTRACTION_CONFIDENCE } from "./browser-contract";

const cents = z.number().int().nonnegative().max(10_000_000);
const text = z.string().trim().min(1).max(200);

export const browserObservationSchema = z.object({
  pageUrl: z.url({ protocol: /^https$/ }),
  observedAt: z.coerce.date(),
  merchant: z.object({ externalRef: text.optional(), name: text.optional() }),
  item: z.object({ externalRef: text.optional(), name: text.optional() }),
  pricing: z.object({
    listPrice: cents.optional(),
    currentPrice: cents.optional(),
    /** Discount as displayed on the page, in percent (e.g. 20 for "-20%"). Informational. */
    displayedDiscount: z.number().min(0).max(100).optional(),
  }),
  context: z
    .object({
      promotionText: z.string().trim().max(200).optional(),
      deliveryFee: cents.optional(),
      deliveryEta: z.string().trim().max(50).optional(),
    })
    .default({}),
  extraction: z.object({
    source: z.literal("dom"),
    confidence: z.number().min(0).max(1),
  }),
});

export type BrowserObservationInput = z.input<typeof browserObservationSchema>;
export type BrowserObservation = z.output<typeof browserObservationSchema>;

export type ConversionResult =
  | { ok: true; observation: RawPriceObservation; warnings: string[] }
  | { ok: false; status: 422; error: string };

/** Max clock skew accepted from the browser, and max age of a capture. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const MAX_AGE_MS = 24 * 3_600_000;

/** "30-40 min", "30–40 min", "35 min" → minutes. */
export function parseEta(eta: string | undefined): { min?: number; max?: number } {
  if (!eta) return {};
  const range = eta.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*min/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return a <= b ? { min: a, max: b } : {};
  }
  const single = eta.match(/(\d{1,3})\s*min/i);
  return single ? { min: Number(single[1]), max: Number(single[1]) } : {};
}

/** Platform label stored on Merchant.platform, derived from the page host. */
export function platformFromUrl(pageUrl: string): string {
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (host === "ifood.com.br" || host.endsWith(".ifood.com.br")) return "ifood";
  return host;
}

/** Keeps origin + path only: query strings and fragments can carry tracking data. */
export function sanitizePageUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  return `${u.origin}${u.pathname}`;
}

/**
 * Pure conversion with explicit rules (documented in README):
 * - currentPrice and an item/merchant identity are required;
 * - listPrice defaults to currentPrice and is never below it;
 * - discountValue = 0: a displayed item discount is already reflected in currentPrice;
 * - deliveryFee = 0 when not observed, with a warning stored in notes.
 */
export function convertBrowserObservation(
  b: BrowserObservation,
  now: Date = new Date(),
): ConversionResult {
  const fail = (error: string): ConversionResult => ({ ok: false, status: 422, error });

  if (b.extraction.confidence < MIN_EXTRACTION_CONFIDENCE) {
    return fail(`Extraction confidence ${b.extraction.confidence} is below ${MIN_EXTRACTION_CONFIDENCE}`);
  }
  if (b.pricing.currentPrice === undefined) return fail("pricing.currentPrice is required");
  const merchantName = b.merchant.name ?? b.merchant.externalRef;
  const itemName = b.item.name ?? b.item.externalRef;
  if (!merchantName) return fail("merchant.name or merchant.externalRef is required");
  if (!itemName) return fail("item.name or item.externalRef is required");

  const t = b.observedAt.getTime();
  if (t > now.getTime() + FUTURE_TOLERANCE_MS) return fail("observedAt is in the future");
  if (t < now.getTime() - MAX_AGE_MS) return fail("observedAt is older than 24h");

  const warnings: string[] = [];
  const current = b.pricing.currentPrice;
  let list = b.pricing.listPrice ?? current;
  if (list < current) {
    warnings.push("listPrice menor que currentPrice; listPrice ajustado para currentPrice.");
    list = current;
  }
  if (b.context.deliveryFee === undefined) {
    warnings.push("Taxa de entrega não observada; registrada como 0.");
  }
  if (!b.merchant.name) warnings.push("Nome do estabelecimento não capturado; usado externalRef.");
  if (!b.item.name) warnings.push("Nome do item não capturado; usado externalRef.");

  const eta = parseEta(b.context.deliveryEta);
  const promotion = b.context.promotionText?.slice(0, 80) || (list > current ? "preço riscado" : undefined);

  return {
    ok: true,
    warnings,
    observation: {
      observedAt: b.observedAt,
      merchant: {
        name: merchantName,
        platform: platformFromUrl(b.pageUrl),
        ...(b.merchant.externalRef ? { externalRef: b.merchant.externalRef } : {}),
      },
      item: {
        name: itemName,
        ...(b.item.externalRef ? { externalRef: b.item.externalRef } : {}),
      },
      listPrice: list,
      currentPrice: current,
      deliveryFee: b.context.deliveryFee ?? 0,
      serviceFee: 0,
      discountValue: 0,
      ...(promotion ? { promotionType: promotion } : {}),
      ...(eta.min !== undefined ? { deliveryEtaMin: eta.min, deliveryEtaMax: eta.max } : {}),
      sourceRef: sanitizePageUrl(b.pageUrl),
      rawPayload: { ...b, pageUrl: sanitizePageUrl(b.pageUrl), observedAt: b.observedAt.toISOString() },
      notes: [
        `Capturado no navegador (DOM, confiança ${b.extraction.confidence.toFixed(2)}).`,
        ...warnings,
      ].join(" "),
    },
  };
}
