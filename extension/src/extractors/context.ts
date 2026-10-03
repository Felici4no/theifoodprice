import { parseBRLToCents } from "@/lib/pricing/money";
import { normalizeText, smallestMatching } from "./dom";
import type { ProductScope } from "./scope";
import { SITE } from "./site";
import { accept, type Extraction } from "./types";

export interface ContextExtraction {
  promotionText: Extraction<string>;
  deliveryFee: Extraction<number>;
  deliveryEta: Extraction<string>;
}

/** Optional context. Every field requires a single unambiguous match on the page. */
export function extractContext(doc: Document, scope: ProductScope | null): ContextExtraction {
  const conf = SITE.confidence.context;
  const unique = (els: Element[]) => {
    const texts = [...new Set(els.map((e) => normalizeText(e.textContent)))];
    return texts.length === 1 ? texts[0] : null;
  };

  // Promotion label inside the product scope.
  let promotionText: Extraction<string> = null;
  if (scope) {
    const promo = unique(
      [...scope.element.querySelectorAll("*")].filter((el) => {
        const t = normalizeText(el.textContent);
        return (
          el.children.length === 0 &&
          t.length > 0 &&
          t.length <= SITE.maxPromotionTextLength &&
          SITE.patterns.promotionKeyword.test(t)
        );
      }),
    );
    if (promo) promotionText = accept({ value: promo, selectorUsed: `${scope.selector} texto promocional`, confidence: conf });
  }

  // Delivery fee: "Entrega grátis" or "Taxa de entrega R$ X" anywhere on the page.
  let deliveryFee: Extraction<number> = null;
  const free = smallestMatching(doc.body, SITE.patterns.freeDelivery);
  const paid = unique(smallestMatching(doc.body, SITE.patterns.deliveryFee));
  if (free.length > 0 && !paid) {
    deliveryFee = accept({ value: 0, selectorUsed: 'texto "Entrega grátis"', confidence: conf });
  } else if (paid && free.length === 0) {
    const cents = parseBRLToCents(paid.match(SITE.patterns.deliveryFee)?.[1] ?? "");
    if (cents !== null) deliveryFee = accept({ value: cents, selectorUsed: 'texto "Taxa de entrega R$"', confidence: conf });
  }

  const eta = unique(smallestMatching(doc.body, SITE.patterns.deliveryEta));
  const deliveryEta = eta ? accept({ value: eta, selectorUsed: 'texto "NN-NN min"', confidence: conf }) : null;

  return { promotionText, deliveryFee, deliveryEta };
}
