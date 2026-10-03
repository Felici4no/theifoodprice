import type { BrowserObservationInput } from "@/lib/ingestion/browser";
import { extractContext, type ContextExtraction } from "./context";
import { extractItem, type ItemIdentity } from "./item";
import { extractMerchantName, extractMerchantRef } from "./merchant";
import { extractPricing, type PricingExtraction } from "./price";
import { findProductScope } from "./scope";
import type { Extraction } from "./types";

export * from "./types";

export interface PageExtraction {
  merchantName: Extraction<string>;
  merchantRef: Extraction<string>;
  item: Extraction<ItemIdentity>;
  pricing: PricingExtraction;
  context: ContextExtraction;
  /** True only when item, current price and a merchant identity were all extracted confidently. */
  supported: boolean;
  /** Weakest confidence among the required fields (0 when unsupported). */
  confidence: number;
}

export function extractPage(doc: Document, location: Pick<Location, "pathname">): PageExtraction {
  const scope = findProductScope(doc);
  const merchantName = extractMerchantName(doc, scope);
  const merchantRef = extractMerchantRef(location.pathname);
  const item = extractItem(doc, scope);
  const pricing = extractPricing(doc, scope);
  const context = extractContext(doc, scope);

  const merchant = merchantName ?? merchantRef;
  const required = [item, pricing.currentPrice, merchant];
  const supported = required.every((r) => r !== null);
  return {
    merchantName,
    merchantRef,
    item,
    pricing,
    context,
    supported,
    confidence: supported ? Math.min(...required.map((r) => r!.confidence)) : 0,
  };
}

/** Raw payload for POST /api/collect/browser. Only confidently extracted values are included. */
export function toBrowserPayload(e: PageExtraction, pageUrl: string, observedAt: Date): BrowserObservationInput {
  if (!e.supported) throw new Error("Cannot build a payload from an unsupported extraction");
  const opt = <K extends string, T>(key: K, x: Extraction<T>) =>
    (x ? { [key]: x.value } : {}) as Partial<Record<K, T>>;
  return {
    pageUrl,
    observedAt: observedAt.toISOString(),
    merchant: { ...opt("name", e.merchantName), ...opt("externalRef", e.merchantRef) },
    item: { name: e.item!.value.name, ...(e.item!.value.externalRef ? { externalRef: e.item!.value.externalRef } : {}) },
    pricing: {
      ...opt("currentPrice", e.pricing.currentPrice),
      ...opt("listPrice", e.pricing.listPrice),
      ...opt("displayedDiscount", e.pricing.displayedDiscount),
    },
    context: {
      ...opt("promotionText", e.context.promotionText),
      ...opt("deliveryFee", e.context.deliveryFee),
      ...opt("deliveryEta", e.context.deliveryEta),
    },
    extraction: { source: "dom", confidence: e.confidence },
  };
}
