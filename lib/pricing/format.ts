import type { Unit, VariableValue } from "@/lib/statistics";
import { formatBRL } from "./money";

export const TIME_ZONE = "America/Sao_Paulo";

const num = (v: number, max = 2) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: max });

/** Formats any explained value by its unit. Safe for client and server. */
export function formatValue(value: VariableValue | boolean | undefined, unit: Unit = "number"): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "string") return value;
  switch (unit) {
    case "cents":
      return formatBRL(value);
    case "percent":
      return `${num(value, 1)}%`;
    case "count":
      return num(value, 0);
    case "zscore":
      return `${value > 0 ? "+" : ""}${num(value, 2)}`;
    default:
      return num(value, 4);
  }
}

/** Signed percentage, e.g. "−13,6%" / "+4,2%". */
export function formatSignedPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${num(Math.abs(value), 1)}%`;
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 3_600_000 → "1 h"; 93_600_000 → "1 d 2 h"; 1_800_000 → "30 min". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

/** "há 3 h", "há 2 d". */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "agora";
  return `há ${formatDuration(ms)}`;
}
