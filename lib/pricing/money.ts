const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 2790 → "R$ 27,90". Accepts fractional cents (e.g. medians) and rounds for display only. */
export function formatBRL(cents: number): string {
  // Intl uses a non-breaking space after "R$"; normalize for plain-text channels.
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/**
 * Parses user input like "27,90", "27.90", "R$ 1.234,56" or "27" into integer cents.
 * Returns null when the input is not a valid non-negative amount.
 */
export function parseBRLToCents(input: string): number | null {
  const s = input.replace(/R\$|\s/g, "");
  if (s === "") return null;
  let normalized: string;
  if (s.includes(",")) {
    // pt-BR: dots are thousands separators, comma is decimal.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}
