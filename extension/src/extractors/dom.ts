/** Generic, site-agnostic DOM helpers used by the extractors. */

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Visible to the user? Uses checkVisibility when available, else style/attribute checks. */
export function isVisible(el: Element): boolean {
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  const anyEl = el as Element & { checkVisibility?: () => boolean };
  if (typeof anyEl.checkVisibility === "function") return anyEl.checkVisibility();
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const style = cur.ownerDocument.defaultView?.getComputedStyle(cur);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  }
  return true;
}

/**
 * Smallest visible elements whose full normalized text matches `pattern`
 * (an element is skipped when one of its children already matches).
 * Handles prices split across spans, e.g. <span>R$</span><span>32,90</span>.
 */
export function smallestMatching(scope: ParentNode, pattern: RegExp): Element[] {
  const out: Element[] = [];
  const all = scope.querySelectorAll("*");
  for (const el of all) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    if (!pattern.test(normalizeText(el.textContent))) continue;
    const childMatches = [...el.children].some((c) => pattern.test(normalizeText(c.textContent)));
    if (!childMatches && isVisible(el)) out.push(el);
  }
  return out;
}

/** Struck-through text (a "de R$ X por R$ Y" list price). */
export function isStruck(el: Element): boolean {
  if (el.closest("s, del, strike")) return true;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const style = cur.ownerDocument.defaultView?.getComputedStyle(cur);
    if (style?.textDecorationLine?.includes("line-through") || style?.textDecoration?.includes("line-through")) {
      return true;
    }
  }
  return false;
}

/** All schema.org objects from JSON-LD blocks, flattening @graph and arrays. Ignores invalid JSON. */
export function readJsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (o["@graph"]) visit(o["@graph"]);
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ""));
    } catch {
      /* malformed block: skip */
    }
  }
  return out;
}

export function hasType(o: Record<string, unknown>, types: readonly string[]): boolean {
  const t = o["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === "string" && types.includes(x));
}
