"use client";

import { useActionState, useState } from "react";
import { ALERT_TYPE_TEXT, type AlertType } from "@/lib/pricing/alerts";
import { WINDOW_KEYS } from "@/lib/pricing/windows";
import { createRule, type RuleFormState } from "./actions";

const input = "rounded-xl border border-border bg-background px-3 py-2.5 text-sm";

export function RuleForm({ items }: { items: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<RuleFormState, FormData>(createRule, { errors: {} });
  const [type, setType] = useState<AlertType>("BELOW_MEDIAN_PCT");
  const err = (k: string) =>
    state.errors[k] ? <span className="text-xs font-medium text-brand">{state.errors[k]}</span> : null;

  return (
    <form action={action} className="grid gap-3 rounded-3xl border border-border p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-semibold text-muted">Item</span>
        <select name="itemId" className={input}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
        {err("itemId")}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Tipo</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as AlertType)} className={input}>
          {(Object.keys(ALERT_TYPE_TEXT) as AlertType[]).map((t) => (
            <option key={t} value={t}>
              {ALERT_TYPE_TEXT[t]}
            </option>
          ))}
        </select>
      </label>

      {type === "ABSOLUTE_PRICE" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Disparar quando preço efetivo ≤ (R$)</span>
          <input name="thresholdBRL" inputMode="decimal" placeholder="27,90" className={input} />
          {err("thresholdBRL")}
        </label>
      )}
      {type === "PERCENTILE" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Disparar quando percentil ≤ (%)</span>
          <input name="thresholdPercent" inputMode="decimal" placeholder="10" className={input} />
          {err("thresholdPercent")}
        </label>
      )}
      {type === "BELOW_MEDIAN_PCT" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Disparar quando ≥ X% abaixo da mediana</span>
          <input name="thresholdPercent" inputMode="decimal" placeholder="15" className={input} />
          {err("thresholdPercent")}
        </label>
      )}
      {type === "NEW_HISTORICAL_LOW" && (
        <p className="self-end text-xs text-muted">Dispara quando o preço atual é menor que todos os anteriores da janela.</p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Janela de referência</span>
        <select name="window" defaultValue="30d" className={input}>
          {WINDOW_KEYS.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Amostra mínima (n)</span>
        <input name="minSampleSize" type="number" min={1} defaultValue={10} className={input} />
        {err("minSampleSize")}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Espera entre disparos (min)</span>
        <input name="cooldownMinutes" type="number" min={0} defaultValue={360} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Canal</span>
        <select name="channel" defaultValue="TELEGRAM" className={input}>
          <option value="TELEGRAM">Telegram</option>
          <option value="CONSOLE">Console (log do servidor)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-semibold text-muted">Chat ID do Telegram (opcional; padrão: TELEGRAM_DEFAULT_CHAT_ID)</span>
        <input name="telegramChatId" className={input} />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Criando…" : "Criar alerta"}
        </button>
        {state.ok && <span className="text-sm font-semibold text-good">Alerta criado.</span>}
      </div>
    </form>
  );
}
