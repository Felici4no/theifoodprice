import { formatBRL } from "@/lib/pricing/money";
import { formatAgo, formatValue } from "@/lib/pricing/format";
import type { Explanation } from "@/lib/statistics";
import type { AnalysisResponse } from "../api/client";
import type { Extraction, PageExtraction } from "../extractors";
import { OVERLAY_CSS } from "./styles";

type Child = Node | string | null | undefined | false;

/** Tiny DOM builder. Text always goes through text nodes — never innerHTML. */
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export type OverlayPhase = "hidden" | "preview" | "submitting" | "result" | "error";

export interface OverlayOptions {
  onCapture: () => void;
  onOpenDashboard: (path: string) => void;
  /** "closed" in production so page scripts cannot read the card; "open" for tests. */
  shadowMode?: ShadowRootMode;
}

const pct = (c: number) => `${Math.round(c * 100)}%`;

/**
 * Floating card rendered in a Shadow DOM so the host page's CSS cannot restyle it
 * and (in closed mode) page scripts cannot read it.
 */
export class PriceOverlay {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private card: HTMLElement;
  phase: OverlayPhase = "hidden";
  private lastAnalysis: AnalysisResponse | null = null;

  constructor(private opts: OverlayOptions) {
    this.host = document.createElement("theifoodprice-overlay");
    this.host.style.all = "initial";
    this.root = this.host.attachShadow({ mode: opts.shadowMode ?? "closed" });
    this.root.append(h("style", {}, OVERLAY_CSS));
    this.card = h("section", { class: "card", role: "complementary", "aria-label": "theifoodprice" });
    this.root.append(this.card);
    this.setVisible(false);
    document.documentElement.append(this.host);
  }

  /**
   * `all: initial` on the host also resets `display`, which would defeat the
   * [hidden] attribute — so visibility is controlled with an explicit display value.
   */
  private setVisible(visible: boolean) {
    this.host.hidden = !visible;
    this.host.style.display = visible ? "block" : "none";
  }

  get visible(): boolean {
    return this.host.style.display !== "none";
  }

  /** For tests (open mode) and debugging. */
  get shadow(): ShadowRoot {
    return this.root;
  }

  hide() {
    this.phase = "hidden";
    this.setVisible(false);
  }

  destroy() {
    this.host.remove();
  }

  showPreview(e: PageExtraction) {
    const price = e.pricing.currentPrice;
    const list = e.pricing.listPrice;
    const canCapture = e.supported;
    const button = h("button", { class: "primary", type: "button" }, "Registrar preço");
    if (!canCapture) button.setAttribute("disabled", "");
    button.addEventListener("click", () => canCapture && this.opts.onCapture());

    this.render(
      "preview",
      h("p", { class: "item" }, e.item?.value.name ?? "Produto não identificado"),
      h("p", { class: "muted" }, e.merchantName?.value ?? (e.merchantRef ? "Estabelecimento (pelo endereço da página)" : "Estabelecimento não identificado")),
      price
        ? h(
            "div",
            { class: "price-row" },
            h("span", { class: "price" }, formatBRL(price.value)),
            list && list.value > price.value ? h("s", { class: "muted" }, formatBRL(list.value)) : null,
          )
        : h("p", { class: "warn" }, "Preço não identificado com segurança. Nada será registrado."),
      this.captureDetails(e),
      button,
      h("p", { class: "fine" }, canCapture ? "Nada é enviado sem o seu clique." : "Captura indisponível nesta tela."),
    );
  }

  showSubmitting() {
    this.render("submitting", h("p", { class: "muted" }, "Registrando e consultando o histórico…"));
  }

  showError(message: string) {
    this.render("error", h("p", { class: "warn" }, message));
  }

  showResult(a: AnalysisResponse, warnings: string[]) {
    this.lastAnalysis = a;
    const diff = a.diffFromMedian.value;
    const rank = a.percentileRank.value;
    const details = h("div", { class: "explain", hidden: "" });

    const metric = (text: string, e: Explanation, cls = "metric") => {
      const b = h("button", { class: cls, type: "button", title: "Ver fórmula e dados" }, text);
      b.addEventListener("click", () => this.toggleExplanation(details, e));
      return b;
    };

    const dashboard = h("button", { class: "primary", type: "button" }, "Ver análise");
    dashboard.addEventListener("click", () => this.opts.onOpenDashboard(a.dashboardPath));

    this.render(
      "result",
      h("p", { class: "item" }, a.item.name),
      h("p", { class: "muted" }, a.item.merchantName),
      a.currentPrice
        ? h("div", { class: "price-row" }, metric(formatBRL(a.currentPrice.value), a.currentPrice.explanation, "price metric"))
        : null,
      diff !== null
        ? metric(
            `${formatValue(Math.abs(diff), "percent")} ${diff < 0 ? "abaixo" : "acima"} da mediana`,
            a.diffFromMedian.explanation,
          )
        : h("p", { class: "muted" }, "Sem histórico anterior para comparar."),
      rank !== null ? metric(`Percentil ${formatValue(rank, "percent")}`, a.percentileRank.explanation) : null,
      metric(a.label.text, a.label.explanation, `label label-${a.label.value}`),
      h("p", { class: "fine" }, `n = ${a.historySize} observações anteriores · janela ${a.window}`),
      details,
      warnings.length ? h("ul", { class: "warnings" }, ...warnings.map((w) => h("li", {}, w))) : null,
      dashboard,
    );
  }

  private toggleExplanation(container: HTMLElement, e: Explanation) {
    const same = container.dataset.name === e.name && !container.hidden;
    container.replaceChildren();
    if (same) {
      container.hidden = true;
      return;
    }
    container.dataset.name = e.name;
    container.hidden = false;
    container.append(
      h("p", { class: "ex-name" }, e.name),
      h("p", { class: "ex-desc" }, e.description),
      h("code", {}, e.formula),
      h(
        "dl",
        {},
        ...Object.entries(e.variables).flatMap(([k, v]) => [
          h("dt", {}, k),
          h("dd", {}, formatValue(v, e.variableUnits?.[k])),
        ]),
      ),
      h(
        "p",
        { class: "fine" },
        `n = ${e.sampleSize}${e.window ? ` · janela ${e.window}` : ""}${
          e.lastUpdatedAt ? ` · atualizado ${formatAgo(e.lastUpdatedAt)}` : ""
        }`,
      ),
      ...(e.notes ?? []).map((n) => h("p", { class: "warn small" }, n)),
    );
  }

  /** What was read from the page, with confidence; nothing below the floor is shown as captured. */
  private captureDetails(e: PageExtraction): HTMLElement {
    const row = <T>(label: string, x: Extraction<T>, fmt: (v: T) => string) =>
      h(
        "tr",
        {},
        h("th", {}, label),
        x ? h("td", { title: x.selectorUsed }, fmt(x.value)) : h("td", { class: "muted" }, "não identificado"),
        h("td", { class: "conf" }, x ? pct(x.confidence) : "—"),
      );
    const details = h(
      "details",
      {},
      h("summary", {}, e.supported ? `Leitura da página · confiança ${pct(e.confidence)}` : "Leitura da página"),
      h(
        "table",
        {},
        row("Item", e.item, (v) => v.name),
        row("Loja", e.merchantName, (v) => v),
        row("ID da loja", e.merchantRef, (v) => `${v.slice(0, 8)}…`),
        row("Preço", e.pricing.currentPrice, formatBRL),
        row("De", e.pricing.listPrice, formatBRL),
        row("Desconto", e.pricing.displayedDiscount, (v) => `${v}%`),
        row("Entrega", e.context.deliveryFee, (v) => (v === 0 ? "grátis" : formatBRL(v))),
        row("Prazo", e.context.deliveryEta, (v) => v),
      ),
      h("p", { class: "fine" }, "Confiança = menor valor entre item, preço e loja. Passe o mouse para ver a origem."),
    );
    return details;
  }

  private render(phase: OverlayPhase, ...content: Child[]) {
    this.phase = phase;
    const close = h("button", { class: "close", type: "button", "aria-label": "Fechar" }, "×");
    close.addEventListener("click", () => this.hide());
    this.card.replaceChildren(
      h(
        "header",
        {},
        h("span", { class: "brand" }, "theifoodprice"),
        h("span", { class: "tag" }, "pessoal · não oficial"),
        close,
      ),
      ...content.filter((c): c is Node | string => Boolean(c)),
    );
    this.setVisible(true);
  }
}
