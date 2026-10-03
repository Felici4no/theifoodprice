import { describe, expect, it } from "vitest";
import { ManualCollector } from "./manual-collector";

const valid = {
  observedAt: "2026-10-01T12:00:00.000Z",
  merchant: { name: "Lanchonete Exemplo" },
  item: { name: "Combo X" },
  listPrice: 3990,
  currentPrice: 3590,
};

describe("ManualCollector", () => {
  it("validates, applies defaults and drains the queue", async () => {
    const c = new ManualCollector();
    c.submit(valid);
    const out = await c.collect();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      merchant: { name: "Lanchonete Exemplo", platform: "manual" },
      deliveryFee: 0,
      serviceFee: 0,
      discountValue: 0,
    });
    expect(out[0].observedAt).toBeInstanceOf(Date);
    expect(await c.collect()).toEqual([]);
  });

  it("rejects fractional cents", () => {
    expect(() => new ManualCollector().submit({ ...valid, currentPrice: 35.9 })).toThrow();
  });

  it("rejects inverted ETA ranges", () => {
    expect(() =>
      new ManualCollector().submit({ ...valid, deliveryEtaMin: 50, deliveryEtaMax: 40 }),
    ).toThrow();
  });

  it("is all-or-nothing per submit call", async () => {
    const c = new ManualCollector();
    expect(() => c.submit(valid, { ...valid, listPrice: -1 })).toThrow();
    expect(await c.collect()).toEqual([]);
  });
});

describe("parseObservationForm", async () => {
  const { parseObservationForm } = await import("./form");
  const form = (fields: Record<string, string>) => (k: string) => fields[k] ?? null;
  const base = {
    merchant: "Lanchonete Exemplo",
    item: "Combo X",
    observedAt: "2026-10-01T12:00:00.000Z",
    listPrice: "39,90",
    currentPrice: "35,90",
  };

  it("converts BRL strings to cents and defaults optional fees to zero", () => {
    const { input, errors } = parseObservationForm(form({ ...base, deliveryFee: "5,99" }));
    expect(errors).toEqual({});
    expect(input).toMatchObject({
      listPrice: 3990,
      currentPrice: 3590,
      deliveryFee: 599,
      serviceFee: 0,
      discountValue: 0,
      merchant: { name: "Lanchonete Exemplo", platform: "manual" },
    });
  });

  it("reports field errors instead of throwing", () => {
    const { input, errors } = parseObservationForm(
      form({ ...base, currentPrice: "abc", merchant: "", deliveryEtaMin: "-3" }),
    );
    expect(input).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["currentPrice", "deliveryEtaMin", "merchant"]);
  });

  it("rejects future observations", () => {
    const { errors } = parseObservationForm(form({ ...base, observedAt: "2999-01-01T00:00:00Z" }));
    expect(errors.observedAt).toBeDefined();
  });
});
