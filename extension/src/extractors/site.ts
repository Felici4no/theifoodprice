/**
 * THE ONLY FILE WITH SITE-SPECIFIC KNOWLEDGE.
 *
 * Every selector, pattern and confidence the extractors use lives here, so
 * calibrating against the real page means editing this file only.
 *
 * Status: NOT calibrated against the live iFood DOM. The strategies below are
 * deliberately generic (schema.org JSON-LD, ARIA roles, visible "R$" text) and
 * carry moderate confidences. When a selector is verified on the real page,
 * add it with a higher confidence and note the date it was checked.
 */

export interface ScopedSelector {
  selector: string;
  confidence: number;
}

export const SITE = {
  /** Hosts where the content script is allowed to run (mirrors manifest matches). */
  hostnames: ["www.ifood.com.br"],

  /** schema.org structured data, when the page provides it. */
  jsonLd: {
    productTypes: ["Product", "MenuItem"],
    merchantTypes: ["Restaurant", "FoodEstablishment", "Store", "LocalBusiness"],
    confidence: 0.9,
  },

  /** Container showing a single product (e.g. an open product dialog). Generic ARIA. */
  productScopes: [{ selector: '[role="dialog"]', confidence: 0.75 }] as ScopedSelector[],

  /** Item name inside a product scope: its first heading. */
  itemHeading: { selector: "h1, h2, h3", confidence: 0.7 },

  /** Merchant name: top-level page heading outside any product scope. */
  merchantHeading: { selector: "h1", confidence: 0.6 },

  /** Merchant id visible in the page URL path (a UUID segment). */
  merchantRefInPath: {
    pattern: /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\/|$)/i,
    confidence: 0.7,
  },

  /** Text patterns, matched against the smallest element containing them. */
  patterns: {
    price: /^R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}$/,
    discountPercent: /^-\s*(\d{1,2})\s*%(?:\s*off)?$/i,
    deliveryEta: /^\d{1,3}\s*[-–]\s*\d{1,3}\s*min$/i,
    freeDelivery: /^entrega\s+grátis$/i,
    deliveryFee: /^(?:taxa\s+de\s+)?entrega\s*:?\s*(R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})$/i,
    promotionKeyword: /(promo|desconto|\boff\b|cupom|grátis)/i,
  },

  confidence: {
    /** Exactly one price candidate in scope. */
    uniquePrice: 0.75,
    /** Several distinct candidates: ambiguous, intentionally below the floor. */
    ambiguousPrice: 0.4,
    discount: 0.65,
    context: 0.6,
  },

  /** Promotional labels longer than this are probably not labels. */
  maxPromotionTextLength: 60,
} as const;

export function isSupportedHost(hostname: string): boolean {
  return (SITE.hostnames as readonly string[]).includes(hostname);
}
