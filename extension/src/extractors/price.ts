import { parseBRLToCents } from "@/lib/pricing/money";
import { hasType, isStruck, normalizeText, readJsonLd, smallestMatching } from "./dom";
import type { ProductScope } from "./scope";
import { SITE } from "./site";
import { accept, type Extraction } from "./types";

export interface PricingExtraction {
  /** Price currently charged for the item, in cents. */
  currentPrice: Extraction<number>;
  /** Struck-through "from" price, in cents. */
  listPrice: Extraction<number>;
  /** Discount badge as displayed, in percent (e.g. 20 for "-20%"). */
  displayedDiscount: Extraction<number>;
}

const NONE: PricingExtraction = { currentPrice: null, listPrice: null, displayedDiscount: null };

/** schema.org offers.price can be a number (32.9) or a string ("32.90"). */
function ldPriceToCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function extractPricing(doc: Document, scope: ProductScope | null): PricingExtraction {
  // 1. schema.org Product.offers.price
  const product = readJsonLd(doc).find((o) => hasType(o, SITE.jsonLd.productTypes));
  const offers = product?.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
  const ldPrice = offer && offer.priceCurrency !== undefined && offer.priceCurrency !== "BRL" ? null : ldPriceToCents(offer?.price);
  if (ldPrice !== null) {
    return {
      ...NONE,
      currentPrice: accept({
        value: ldPrice,
        selectorUsed: "json-ld Product.offers.price",
        confidence: SITE.jsonLd.confidence,
      }),
    };
  }

  // 2. Visible "R$ 00,00" texts inside the product scope.
  if (!scope) return NONE;
  const candidates = smallestMatching(scope.element, SITE.patterns.price).map((el) => ({
    cents: parseBRLToCents(normalizeText(el.textContent)),
    struck: isStruck(el),
  }));

  return {
    currentPrice: pickUnique(
      candidates.filter((c) => !c.struck).map((c) => c.cents),
      `${scope.selector} texto "R$" (não riscado)`,
      scope.confidence,
    ),
    listPrice: pickUnique(
      candidates.filter((c) => c.struck).map((c) => c.cents),
      `${scope.selector} texto "R$" riscado`,
      scope.confidence,
    ),
    displayedDiscount: extractDiscount(scope),
  };
}

/**
 * One distinct value → trusted (up to the scope's confidence).
 * Several distinct values (e.g. add-on prices) → ambiguous → below the floor → null.
 */
function pickUnique(values: (number | null)[], selectorUsed: string, scopeConfidence: number): Extraction<number> {
  const distinct = [...new Set(values.filter((v): v is number => v !== null))];
  if (distinct.length === 0) return null;
  return accept({
    value: distinct[0],
    selectorUsed: distinct.length === 1 ? selectorUsed : `${selectorUsed} — ${distinct.length} candidatos`,
    confidence:
      distinct.length === 1
        ? Math.min(scopeConfidence, SITE.confidence.uniquePrice)
        : SITE.confidence.ambiguousPrice,
  });
}

function extractDiscount(scope: ProductScope): Extraction<number> {
  const matches = smallestMatching(scope.element, SITE.patterns.discountPercent);
  const values = [
    ...new Set(
      matches.map((el) => Number(normalizeText(el.textContent).match(SITE.patterns.discountPercent)?.[1])),
    ),
  ];
  if (values.length !== 1 || !Number.isFinite(values[0])) return null;
  return accept({
    value: values[0],
    selectorUsed: `${scope.selector} texto "-N%"`,
    confidence: SITE.confidence.discount,
  });
}
