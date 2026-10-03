import type { Explained } from "@/lib/statistics";

export interface PriceComponents {
  currentPrice: number;
  deliveryFee: number;
  serviceFee: number;
  discountValue: number;
}

/**
 * effectivePrice = currentPrice + deliveryFee + serviceFee − discountValue, floored at 0.
 * Mirrors the CHECK constraint on PriceObservation.
 */
export function effectivePrice(input: PriceComponents): Explained<number> {
  // Pick only the price components; callers may pass a full observation.
  const c: PriceComponents = {
    currentPrice: input.currentPrice,
    deliveryFee: input.deliveryFee,
    serviceFee: input.serviceFee,
    discountValue: input.discountValue,
  };
  for (const [k, v] of Object.entries(c)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${k} must be a non-negative integer in cents, got ${v}`);
    }
  }
  const raw = c.currentPrice + c.deliveryFee + c.serviceFee - c.discountValue;
  return {
    value: Math.max(0, raw),
    explanation: {
      name: "Preço efetivo",
      description:
        "Quanto o pedido realmente custa: preço do item mais taxas, menos descontos aplicáveis.",
      formula: "max(0, currentPrice + deliveryFee + serviceFee − discountValue)",
      variables: { ...c },
      variableUnits: {
        currentPrice: "cents",
        deliveryFee: "cents",
        serviceFee: "cents",
        discountValue: "cents",
      },
      unit: "cents",
      sampleSize: 1,
      notes:
        raw < 0 ? ["Desconto maior que o total; preço efetivo limitado a zero."] : [],
    },
  };
}
