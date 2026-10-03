import { isVisible } from "./dom";
import { SITE } from "./site";

export interface ProductScope {
  element: Element;
  selector: string;
  confidence: number;
}

/**
 * The container showing a single product. When several match, the last visible
 * one wins (dialogs stack on top). null when no product is in focus.
 */
export function findProductScope(doc: Document): ProductScope | null {
  for (const s of SITE.productScopes) {
    const visible = [...doc.querySelectorAll(s.selector)].filter(isVisible);
    const element = visible.at(-1);
    if (element) return { element, selector: s.selector, confidence: s.confidence };
  }
  return null;
}
