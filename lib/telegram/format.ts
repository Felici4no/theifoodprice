import type { PriceAnalysisResult } from "@/lib/pricing/analysis";
import { ALERT_TYPE_TEXT, type AlertType } from "@/lib/pricing/alerts";
import { formatBRL, formatPercent } from "@/lib/pricing/money";

/**
 * Plain-text alert. Every number comes from the analysis' explained values,
 * and the message always states the sample size and window.
 */
export function formatAlertMessage(params: {
  itemName: string;
  merchantName: string;
  ruleType: AlertType;
  analysis: PriceAnalysisResult;
}): string {
  const { itemName, merchantName, ruleType, analysis: a } = params;
  const lines: string[] = [itemName, merchantName, ""];

  const current = a.current?.effectivePrice;
  if (current !== undefined) lines.push(`${formatBRL(current)} agora`);

  const diff = a.diffFromMedian.value;
  if (diff !== null) {
    const dir = diff < 0 ? "abaixo" : "acima";
    lines.push(`${formatPercent(Math.abs(diff))} ${dir} da mediana`);
  }
  if (a.percentileRank.value !== null) {
    lines.push(`Percentil: ${Math.round(a.percentileRank.value)}%`);
  }
  if (a.isNewLow.value) lines.push("Menor preço da janela");

  lines.push("");
  if (a.median.value !== null) {
    lines.push(`Mediana ${a.window}: ${formatBRL(a.median.value)}`);
  }
  lines.push(`${a.historySize} observações.`);
  lines.push("");
  lines.push(`Regra: ${ALERT_TYPE_TEXT[ruleType]}`);
  lines.push("Estatística descritiva do histórico coletado; não é previsão.");
  return lines.join("\n");
}
