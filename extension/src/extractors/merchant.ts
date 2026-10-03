import { hasType, isVisible, normalizeText, readJsonLd } from "./dom";
import type { ProductScope } from "./scope";
import { SITE } from "./site";
import { accept, type Extraction } from "./types";

/** Merchant display name. */
export function extractMerchantName(doc: Document, scope: ProductScope | null): Extraction<string> {
  const ld = readJsonLd(doc).find((o) => hasType(o, SITE.jsonLd.merchantTypes));
  const ldName = ld && normalizeText(String(ld.name ?? ""));
  if (ld && ldName) {
    return accept({
      value: ldName,
      selectorUsed: `json-ld ${String(ld["@type"])}.name`,
      confidence: SITE.jsonLd.confidence,
    });
  }

  // Page heading outside the product dialog; must be unique to be trusted.
  const headings = [...doc.querySelectorAll(SITE.merchantHeading.selector)].filter(
    (h) => isVisible(h) && !scope?.element.contains(h) && normalizeText(h.textContent),
  );
  if (headings.length !== 1) return null;
  return accept({
    value: normalizeText(headings[0].textContent),
    selectorUsed: `${SITE.merchantHeading.selector} (fora do produto)`,
    confidence: SITE.merchantHeading.confidence,
  });
}

/** Merchant id as shown in the page URL. Reads only the visible address, never network data. */
export function extractMerchantRef(pathname: string): Extraction<string> {
  const m = pathname.match(SITE.merchantRefInPath.pattern);
  if (!m) return null;
  return accept({
    value: m[1].toLowerCase(),
    selectorUsed: "location.pathname (segmento UUID)",
    confidence: SITE.merchantRefInPath.confidence,
  });
}
