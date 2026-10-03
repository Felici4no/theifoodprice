import { parseBRLToCents } from "@/lib/pricing/money";
import type { RawPriceObservationInput } from "./types";

export type FormErrors = Partial<Record<string, string>>;

const MONEY_FIELDS = ["listPrice", "currentPrice", "deliveryFee", "serviceFee", "discountValue"] as const;

/**
 * Converts the manual-entry form (BRL strings like "27,90") into collector input.
 * Pure; returns field errors instead of throwing.
 */
export function parseObservationForm(
  get: (name: string) => string | null,
): { input?: RawPriceObservationInput; errors: FormErrors } {
  const errors: FormErrors = {};
  const text = (k: string) => get(k)?.trim() || undefined;

  const money: Partial<Record<(typeof MONEY_FIELDS)[number], number>> = {};
  for (const k of MONEY_FIELDS) {
    const raw = text(k);
    const optional = k !== "listPrice" && k !== "currentPrice";
    if (!raw) {
      if (optional) money[k] = 0;
      else errors[k] = "Obrigatório";
      continue;
    }
    const cents = parseBRLToCents(raw);
    if (cents === null) errors[k] = "Valor inválido (ex.: 27,90)";
    else money[k] = cents;
  }

  const int = (k: string) => {
    const raw = text(k);
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      errors[k] = "Minutos inteiros";
      return undefined;
    }
    return n;
  };

  const merchant = text("merchant");
  const item = text("item");
  const observedAt = text("observedAt");
  if (!merchant) errors.merchant = "Obrigatório";
  if (!item) errors.item = "Obrigatório";
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) errors.observedAt = "Data inválida";
  else if (Date.parse(observedAt) > Date.now() + 5 * 60_000) errors.observedAt = "Data no futuro";

  const deliveryEtaMin = int("deliveryEtaMin");
  const deliveryEtaMax = int("deliveryEtaMax");

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      observedAt: observedAt!,
      merchant: { name: merchant!, platform: text("platform") ?? "manual" },
      item: { name: item! },
      listPrice: money.listPrice!,
      currentPrice: money.currentPrice!,
      deliveryFee: money.deliveryFee!,
      serviceFee: money.serviceFee!,
      discountValue: money.discountValue!,
      promotionType: text("promotionType"),
      deliveryEtaMin,
      deliveryEtaMax,
      notes: text("notes"),
    },
  };
}
