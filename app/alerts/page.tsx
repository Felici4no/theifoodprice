import { connection } from "next/server";
import { Explain } from "@/components/explain";
import { db } from "@/lib/db/client";
import { listItems, loadItemAnalyses } from "@/lib/db/queries";
import { ALERT_TYPE_TEXT, evaluateAlert } from "@/lib/pricing/alerts";
import { formatDateTime, formatValue } from "@/lib/pricing/format";
import { isWindowKey, WINDOW_KEYS, type WindowKey } from "@/lib/pricing/windows";
import { deleteRule, toggleRule } from "./actions";
import { RuleForm } from "./rule-form";

export default async function AlertsPage() {
  await connection();
  const now = new Date();
  const [rules, events, items] = await Promise.all([
    db().alertRule.findMany({
      include: { item: { include: { merchant: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db().alertEvent.findMany({
      include: { rule: { include: { item: true } } },
      orderBy: { triggeredAt: "desc" },
      take: 20,
    }),
    listItems(),
  ]);

  // One analysis per (item, window) actually used by a rule.
  const analyses = new Map<string, Awaited<ReturnType<typeof loadItemAnalyses>>[number]>();
  for (const w of WINDOW_KEYS) {
    const ids = [...new Set(rules.filter((r) => r.window === w).map((r) => r.itemId))];
    for (const itemId of ids) {
      const [a] = await loadItemAnalyses(w, now, { itemId });
      analyses.set(`${itemId}:${w}`, a);
    }
  }

  const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted">
          Regras avaliadas a cada nova observação. Alertas estatísticos só disparam com amostra mínima.
        </p>
      </div>

      <p
        className={`rounded-2xl p-3 text-sm ${telegramReady ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}
      >
        {telegramReady
          ? "Telegram configurado via TELEGRAM_BOT_TOKEN."
          : "TELEGRAM_BOT_TOKEN não definido: alertas de Telegram são apenas registrados no log do servidor."}
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Regras ({rules.length})</h2>
        {rules.length === 0 && <p className="text-sm text-muted">Nenhuma regra ainda.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {rules.map((rule) => {
            const window: WindowKey = isWindowKey(rule.window) ? rule.window : "30d";
            const data = analyses.get(`${rule.itemId}:${window}`);
            const decision = data ? evaluateAlert(rule, data.analysis, now) : null;
            return (
              <li key={rule.id} className="space-y-2 rounded-3xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{rule.item.name}</p>
                    <p className="text-xs text-muted">{rule.item.merchant.name}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      rule.active ? "bg-good-soft text-good" : "bg-surface text-muted"
                    }`}
                  >
                    {rule.active ? "ativa" : "pausada"}
                  </span>
                </div>
                <p className="text-sm">
                  {ALERT_TYPE_TEXT[rule.type]}
                  {rule.thresholdCents !== null && ` · ≤ ${formatValue(rule.thresholdCents, "cents")}`}
                  {rule.thresholdPercent !== null &&
                    (rule.type === "PERCENTILE"
                      ? ` · percentil ≤ ${formatValue(rule.thresholdPercent, "percent")}`
                      : ` · ≥ ${formatValue(rule.thresholdPercent, "percent")} abaixo`)}
                </p>
                <p className="text-xs text-muted">
                  Janela {rule.window} · n mínimo {rule.minSampleSize} · espera {rule.cooldownMinutes} min ·{" "}
                  {rule.channel === "TELEGRAM" ? "Telegram" : "Console"}
                  {rule.lastTriggeredAt && ` · último disparo ${formatDateTime(rule.lastTriggeredAt)}`}
                </p>
                {decision && (
                  <p className="text-sm">
                    Agora:{" "}
                    <Explain
                      explanation={decision.explanation}
                      className={decision.value ? "font-semibold text-good" : "text-muted"}
                    >
                      {decision.value ? "condição satisfeita" : blockedText(decision.blockedBy)}
                    </Explain>
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <form action={toggleRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold">
                      {rule.active ? "Pausar" : "Ativar"}
                    </button>
                  </form>
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand">Excluir</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {items.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Nova regra</h2>
          <RuleForm items={items.map((i) => ({ id: i.id, label: `${i.name} · ${i.merchant.name}` }))} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Disparos recentes</h2>
        {events.length === 0 && <p className="text-sm text-muted">Nenhum disparo ainda.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-3xl bg-surface p-4">
              <div className="mb-2 flex justify-between text-xs text-muted">
                <span>{formatDateTime(e.triggeredAt)}</span>
                <span className={e.delivered ? "text-good" : "text-brand"} title={e.deliveryError ?? undefined}>
                  {e.delivered ? "entregue" : "falhou"}
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm">{e.message}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function blockedText(reason: string | undefined): string {
  switch (reason) {
    case "inactive":
      return "regra pausada";
    case "no-current":
      return "sem observação na janela";
    case "sample":
      return "histórico insuficiente";
    case "cooldown":
      return "em período de espera";
    case "config":
      return "dados indisponíveis";
    default:
      return "condição não satisfeita";
  }
}
