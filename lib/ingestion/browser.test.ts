import { describe, expect, it } from "vitest";
import {
  browserObservationSchema,
  convertBrowserObservation,
  parseEta,
  platformFromUrl,
  sanitizePageUrl,
  type BrowserObservationInput,
} from "./browser";

const NOW = new Date("2026-10-03T12:00:00.000Z");

const base: BrowserObservationInput = {
  pageUrl: "https://www.ifood.com.br/delivery/sao-paulo-sp/lanchonete-x/0f8fad5b-d9cb-469f-a165-70867728950e?utm_source=x#top",
  observedAt: "2026-10-03T11:59:00.000Z",
  merchant: { name: "Lanchonete X", externalRef: "0f8fad5b-d9cb-469f-a165-70867728950e" },
  item: { name: "Combo 1" },
  pricing: { listPrice: 3990, currentPrice: 3290, displayedDiscount: 18 },
  context: { promotionText: "18% off", deliveryFee: 599, deliveryEta: "30-40 min" },
  extraction: { source: "dom", confidence: 0.75 },
};

const convert = (over: Partial<BrowserObservationInput> = {}) =>
  convertBrowserObservation(browserObservationSchema.parse({ ...base, ...over }), NOW);

describe("browserObservationSchema", () => {
  it("rejects non-https pages and fractional cents", () => {
    expect(browserObservationSchema.safeParse({ ...base, pageUrl: "http://x.com" }).success).toBe(false);
    expect(
      browserObservationSchema.safeParse({ ...base, pricing: { currentPrice: 32.9 } }).success,
    ).toBe(false);
  });
  it("rejects unknown extraction sources", () => {
    expect(
      browserObservationSchema.safeParse({ ...base, extraction: { source: "api", confidence: 1 } }).success,
    ).toBe(false);
  });
});

describe("convertBrowserObservation", () => {
  it("maps a complete capture", () => {
    const r = convert();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.observation).toMatchObject({
      merchant: { name: "Lanchonete X", platform: "ifood", externalRef: "0f8fad5b-d9cb-469f-a165-70867728950e" },
      item: { name: "Combo 1" },
      listPrice: 3990,
      currentPrice: 3290,
      deliveryFee: 599,
      serviceFee: 0,
      discountValue: 0,
      promotionType: "18% off",
      deliveryEtaMin: 30,
      deliveryEtaMax: 40,
      sourceRef: "https://www.ifood.com.br/delivery/sao-paulo-sp/lanchonete-x/0f8fad5b-d9cb-469f-a165-70867728950e",
    });
    expect(JSON.stringify(r.observation.rawPayload)).not.toContain("utm_source");
  });

  it("refuses low-confidence captures", () => {
    const r = convert({ extraction: { source: "dom", confidence: 0.4 } });
    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it("requires a current price and identities", () => {
    expect(convert({ pricing: { listPrice: 100 } }).ok).toBe(false);
    expect(convert({ item: {} }).ok).toBe(false);
    expect(convert({ merchant: {} }).ok).toBe(false);
  });

  it("falls back to externalRef as name, with a warning", () => {
    const r = convert({ merchant: { externalRef: "abc" } });
    expect(r.ok && r.observation.merchant.name).toBe("abc");
    expect(r.ok && r.warnings.join(" ")).toMatch(/externalRef/);
  });

  it("defaults list price and missing delivery fee explicitly", () => {
    const r = convert({ pricing: { currentPrice: 2000 }, context: {} });
    expect(r.ok && r.observation).toMatchObject({ listPrice: 2000, deliveryFee: 0 });
    expect(r.ok && r.observation.notes).toMatch(/Taxa de entrega não observada/);
  });

  it("never stores listPrice below currentPrice", () => {
    const r = convert({ pricing: { listPrice: 1000, currentPrice: 2000 } });
    expect(r.ok && r.observation.listPrice).toBe(2000);
  });

  it("rejects stale or future timestamps", () => {
    expect(convert({ observedAt: "2026-10-01T00:00:00Z" }).ok).toBe(false);
    expect(convert({ observedAt: "2026-10-03T13:00:00Z" }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it.each([
    ["30-40 min", { min: 30, max: 40 }],
    ["30 – 40 min", { min: 30, max: 40 }],
    ["35 min", { min: 35, max: 35 }],
    ["40-30 min", {}],
    ["rápido", {}],
  ])("parseEta(%s)", (s, expected) => expect(parseEta(s)).toEqual(expected));

  it("derives platform from host", () => {
    expect(platformFromUrl("https://www.ifood.com.br/x")).toBe("ifood");
    expect(platformFromUrl("https://evil-ifood.com.br/x")).toBe("evil-ifood.com.br");
  });

  it("drops query and fragment", () => {
    expect(sanitizePageUrl("https://a.com/p?q=1#h")).toBe("https://a.com/p");
  });
});
