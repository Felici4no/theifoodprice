import { hasType, isVisible, normalizeText, readJsonLd } from "./dom";
import type { ProductScope } from "./scope";
import { SITE } from "./site";
import { accept, type Extraction } from "./types";

export interface ItemIdentity {
  name: string;
  externalRef?: string;
}

/** Item name (and id when the page publishes one) of the product in focus. */
export function extractItem(doc: Document, scope: ProductScope | null): Extraction<ItemIdentity> {
  // 1. schema.org Product / MenuItem.
  const product = readJsonLd(doc).find((o) => hasType(o, SITE.jsonLd.productTypes));
  const ldName = product && normalizeText(String(product.name ?? ""));
  if (product && ldName) {
    const ref = product.sku ?? product.productID ?? product["@id"];
    return accept({
      value: { name: ldName, ...(typeof ref === "string" && ref ? { externalRef: ref } : {}) },
      selectorUsed: `json-ld ${String(product["@type"])}.name`,
      confidence: SITE.jsonLd.confidence,
    });
  }

  // 2. First visible heading inside the product scope.
  if (!scope) return null;
  const heading = [...scope.element.querySelectorAll(SITE.itemHeading.selector)].find(
    (h) => isVisible(h) && normalizeText(h.textContent),
  );
  if (!heading) return null;
  return accept({
    value: { name: normalizeText(heading.textContent) },
    selectorUsed: `${scope.selector} ${heading.tagName.toLowerCase()}`,
    confidence: Math.min(scope.confidence, SITE.itemHeading.confidence),
  });
}
