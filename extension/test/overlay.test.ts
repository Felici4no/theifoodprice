// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResponse } from "../src/api/client";
import { extractPage } from "../src/extractors";
import { PriceOverlay } from "../src/overlay/PriceOverlay";

// Synthetic markup (see extractors.test.ts).
const DIALOG = `<h1>Lanchonete Exemplo</h1>
  <div role="dialog"><h2>Combo Clássico</h2><s>R$ 39,90</s><span>R$ 32,90</span></div>`;

const explanation = (name: string) => ({
  name,
  description: "d",
  formula: "(current − median) / median × 100",
  variables: { current: 3290, median: 4000 },
  variableUnits: { current: "cents" as const, median: "cents" as const },
  unit: "percent" as const,
  sampleSize: 42,
  window: "30d",
});

const ANALYSIS: AnalysisResponse = {
  item: { id: "item1", name: "Combo Clássico", merchantName: "Lanchonete Exemplo", platform: "ifood" },
  window: "30d",
  methodologyVersion: "1.0.0",
  computedAt: "2026-10-03T12:00:00Z",
  historySize: 42,
  currentPrice: { value: 3290, explanation: { ...explanation("Preço efetivo"), unit: "cents" } },
  median: { value: 4000, explanation: { ...explanation("Mediana 30d"), unit: "cents" } },
  diffFromMedian: { value: -17.75, explanation: explanation("Diferença vs mediana") },
  percentileRank: { value: 14, explanation: explanation("Percentil do preço") },
  isNewLow: { value: false, explanation: explanation("Nova mínima") },
  label: { value: "low", text: "Preço historicamente baixo", explanation: explanation("Classificação") },
  dashboardPath: "/history?item=item1&w=30d",
};

function setup() {
  const onCapture = vi.fn();
  const onOpenDashboard = vi.fn();
  const overlay = new PriceOverlay({ onCapture, onOpenDashboard, shadowMode: "open" });
  const $ = (sel: string) => overlay.shadow.querySelector(sel) as HTMLElement;
  const text = () => overlay.shadow.textContent ?? "";
  return { overlay, onCapture, onOpenDashboard, $, text };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll("theifoodprice-overlay").forEach((n) => n.remove());
});

describe("PriceOverlay", () => {
  it("previews a confident capture and only submits on click", () => {
    document.body.innerHTML = DIALOG;
    const { overlay, onCapture, $, text } = setup();
    overlay.showPreview(extractPage(document, { pathname: "/" }));
    expect(overlay.host.hidden).toBe(false);
    expect(text()).toContain("R$ 32,90");
    expect(text()).toContain("R$ 39,90");
    expect(text()).toContain("Nada é enviado sem o seu clique.");
    expect(text()).toMatch(/não oficial/);
    expect(onCapture).not.toHaveBeenCalled();
    $("button.primary").click();
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it("never claims a price it could not read confidently", () => {
    document.body.innerHTML = `<h1>Loja</h1><div role="dialog"><h2>Pizza</h2>
      <span>R$ 49,90</span><span>R$ 8,00</span></div>`;
    const { overlay, onCapture, $, text } = setup();
    overlay.showPreview(extractPage(document, { pathname: "/" }));
    expect(text()).toContain("Preço não identificado com segurança");
    expect(text()).not.toContain("R$ 49,90");
    expect($("button.primary").hasAttribute("disabled")).toBe(true);
    $("button.primary").click();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("shows the analysis and its explanations", () => {
    const { overlay, onOpenDashboard, $, text } = setup();
    overlay.showResult(ANALYSIS, ["Taxa de entrega não observada; registrada como 0."]);
    expect(text()).toContain("17,8% abaixo da mediana");
    expect(text()).toContain("Percentil 14%");
    expect(text()).toContain("Preço historicamente baixo");
    expect(text()).toContain("n = 42");
    expect(text()).toContain("Taxa de entrega não observada");

    const percentile = [...overlay.shadow.querySelectorAll("button.metric")].find((b) =>
      b.textContent?.startsWith("Percentil"),
    ) as HTMLElement;
    percentile.click();
    expect($(".explain").hidden).toBe(false);
    expect($(".explain").textContent).toContain("(current − median) / median × 100");
    expect($(".explain").textContent).toContain("R$ 40,00");
    percentile.click();
    expect($(".explain").hidden).toBe(true);

    [...overlay.shadow.querySelectorAll("button.primary")].at(-1)!.dispatchEvent(new MouseEvent("click"));
    expect(onOpenDashboard).toHaveBeenCalledWith("/history?item=item1&w=30d");
  });

  it("renders page text as text, never as HTML", () => {
    document.body.innerHTML = `<h1>Loja</h1><div role="dialog"><h2>&lt;img src=x onerror=alert(1)&gt;</h2><span>R$ 1,00</span></div>`;
    const { overlay } = setup();
    overlay.showPreview(extractPage(document, { pathname: "/" }));
    expect(overlay.shadow.querySelector("img")).toBeNull();
    expect(overlay.shadow.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("closes", () => {
    document.body.innerHTML = DIALOG;
    const { overlay, $ } = setup();
    overlay.showPreview(extractPage(document, { pathname: "/" }));
    $("button.close").click();
    expect(overlay.host.hidden).toBe(true);
    expect(overlay.phase).toBe("hidden");
  });
});
