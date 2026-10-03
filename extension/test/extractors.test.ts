// @vitest-environment jsdom
/**
 * Fixtures below are SYNTHETIC HTML written for these tests. They are not
 * captured from iFood and make no claim about its real markup; they exercise
 * the generic strategies (JSON-LD, ARIA dialog, visible "R$" text).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { extractPage, toBrowserPayload } from "../src/extractors";
import { extractMerchantRef } from "../src/extractors/merchant";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const STORE_PATH = `/delivery/sao-paulo-sp/lanchonete-x/${UUID}`;

function page(html: string) {
  document.body.innerHTML = html;
  document.head.innerHTML = "";
}

const DIALOG = `
  <h1>Lanchonete Exemplo</h1>
  <p>30-40 min</p><p>Entrega grátis</p>
  <div role="dialog">
    <h2>Combo Clássico</h2>
    <p>Hambúrguer, batata e refri</p>
    <span>-18%</span>
    <s>R$ 39,90</s>
    <strong><span>R$</span> <span>32,90</span></strong>
    <p>Promoção de hoje</p>
  </div>`;

beforeEach(() => page(""));

describe("product dialog (generic DOM strategy)", () => {
  it("extracts item, prices, merchant and context", () => {
    page(DIALOG);
    const e = extractPage(document, { pathname: STORE_PATH });
    expect(e.supported).toBe(true);
    expect(e.item).toMatchObject({ value: { name: "Combo Clássico" }, confidence: 0.7 });
    expect(e.item?.selectorUsed).toBe('[role="dialog"] h2');
    expect(e.pricing.currentPrice).toMatchObject({ value: 3290, confidence: 0.75 });
    expect(e.pricing.listPrice).toMatchObject({ value: 3990 });
    expect(e.pricing.displayedDiscount).toMatchObject({ value: 18 });
    expect(e.merchantName).toMatchObject({ value: "Lanchonete Exemplo", confidence: 0.6 });
    expect(e.merchantRef).toMatchObject({ value: UUID });
    expect(e.context.deliveryFee).toMatchObject({ value: 0 });
    expect(e.context.deliveryEta).toMatchObject({ value: "30-40 min" });
    expect(e.context.promotionText).toMatchObject({ value: "Promoção de hoje" });
    expect(e.confidence).toBe(0.6);
  });

  it("returns null for the price when several prices compete (e.g. add-ons)", () => {
    page(`<h1>Loja</h1><div role="dialog"><h2>Pizza</h2>
      <span>R$ 49,90</span><ul><li>Borda <span>R$ 8,00</span></li></ul></div>`);
    const e = extractPage(document, { pathname: STORE_PATH });
    expect(e.pricing.currentPrice).toBeNull();
    expect(e.supported).toBe(false);
    expect(e.confidence).toBe(0);
  });

  it("does not treat '+ R$ 2,00' add-on labels as prices", () => {
    page(`<h1>Loja</h1><div role="dialog"><h2>Açaí</h2><span>R$ 21,90</span><span>+ R$ 2,00</span></div>`);
    expect(extractPage(document, { pathname: "/" }).pricing.currentPrice?.value).toBe(2190);
  });

  it("ignores hidden dialogs", () => {
    page(`<h1>Loja</h1><div role="dialog" hidden><h2>Velho</h2><span>R$ 1,00</span></div>`);
    const e = extractPage(document, { pathname: STORE_PATH });
    expect(e.item).toBeNull();
    expect(e.supported).toBe(false);
  });

  it("uses the top-most (last) visible dialog", () => {
    page(`<h1>Loja</h1>
      <div role="dialog"><h2>Primeiro</h2><span>R$ 10,00</span></div>
      <div role="dialog"><h2>Segundo</h2><span>R$ 20,00</span></div>`);
    const e = extractPage(document, { pathname: "/" });
    expect(e.item?.value.name).toBe("Segundo");
    expect(e.pricing.currentPrice?.value).toBe(2000);
  });

  it("detects strike-through via CSS too", () => {
    page(`<h1>Loja</h1><div role="dialog"><h2>X</h2>
      <span style="text-decoration: line-through">R$ 15,00</span><span>R$ 12,00</span></div>`);
    const e = extractPage(document, { pathname: "/" });
    expect(e.pricing.listPrice?.value).toBe(1500);
    expect(e.pricing.currentPrice?.value).toBe(1200);
  });

  it("is unsupported without a product in focus", () => {
    page(`<h1>Loja</h1><p>R$ 10,00</p><p>R$ 20,00</p>`);
    expect(extractPage(document, { pathname: STORE_PATH }).supported).toBe(false);
  });

  it("does not trust the merchant heading when several h1 exist", () => {
    page(`<h1>A</h1><h1>B</h1><div role="dialog"><h2>X</h2><span>R$ 1,00</span></div>`);
    const e = extractPage(document, { pathname: "/" });
    expect(e.merchantName).toBeNull();
    expect(e.supported).toBe(false); // no name and no ref in URL
  });

  it("rejects ambiguous delivery fee", () => {
    page(DIALOG + `<p>Taxa de entrega R$ 5,99</p>`);
    expect(extractPage(document, { pathname: "/" }).context.deliveryFee).toBeNull();
  });
});

describe("JSON-LD strategy", () => {
  it("prefers schema.org data with high confidence", () => {
    page(DIALOG);
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify({
      "@graph": [
        { "@type": "Restaurant", name: "Restaurante LD" },
        { "@type": "Product", name: "Produto LD", sku: "sku-1", offers: { price: "27.90", priceCurrency: "BRL" } },
      ],
    });
    document.head.appendChild(s);
    const e = extractPage(document, { pathname: "/" });
    expect(e.item).toMatchObject({ value: { name: "Produto LD", externalRef: "sku-1" }, confidence: 0.9 });
    expect(e.pricing.currentPrice).toMatchObject({ value: 2790, selectorUsed: "json-ld Product.offers.price" });
    expect(e.merchantName?.value).toBe("Restaurante LD");
  });

  it("skips malformed JSON-LD", () => {
    page(DIALOG);
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = "{not json";
    document.head.appendChild(s);
    expect(extractPage(document, { pathname: "/" }).item?.value.name).toBe("Combo Clássico");
  });
});

describe("merchant ref from URL", () => {
  it("reads a UUID path segment only", () => {
    expect(extractMerchantRef(STORE_PATH)?.value).toBe(UUID);
    expect(extractMerchantRef("/delivery/sao-paulo-sp/lanchonete-x")).toBeNull();
    expect(extractMerchantRef(`/x/${UUID}extra`)).toBeNull();
  });
});

describe("toBrowserPayload", () => {
  it("includes only confident values and matches the backend contract", () => {
    page(DIALOG);
    const e = extractPage(document, { pathname: STORE_PATH });
    const p = toBrowserPayload(e, `https://www.ifood.com.br${STORE_PATH}`, new Date("2026-10-03T12:00:00Z"));
    expect(p).toEqual({
      pageUrl: `https://www.ifood.com.br${STORE_PATH}`,
      observedAt: "2026-10-03T12:00:00.000Z",
      merchant: { name: "Lanchonete Exemplo", externalRef: UUID },
      item: { name: "Combo Clássico" },
      pricing: { currentPrice: 3290, listPrice: 3990, displayedDiscount: 18 },
      context: { promotionText: "Promoção de hoje", deliveryFee: 0, deliveryEta: "30-40 min" },
      extraction: { source: "dom", confidence: 0.6 },
    });
  });

  it("refuses unsupported extractions", () => {
    page(`<p>nada</p>`);
    expect(() => toBrowserPayload(extractPage(document, { pathname: "/" }), "https://x", new Date())).toThrow();
  });
});

describe("contract with the backend", async () => {
  const { browserObservationSchema, convertBrowserObservation } = await import("@/lib/ingestion/browser");
  it("a payload built by the extension is accepted and converted by the backend", () => {
    page(DIALOG);
    const now = new Date("2026-10-03T12:00:00Z");
    const payload = toBrowserPayload(
      extractPage(document, { pathname: STORE_PATH }),
      `https://www.ifood.com.br${STORE_PATH}`,
      now,
    );
    const converted = convertBrowserObservation(browserObservationSchema.parse(payload), now);
    expect(converted.ok).toBe(true);
    expect(converted.ok && converted.observation).toMatchObject({
      currentPrice: 3290,
      listPrice: 3990,
      deliveryFee: 0,
      deliveryEtaMin: 30,
      merchant: { platform: "ifood", externalRef: UUID },
    });
  });
});
