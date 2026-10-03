"use client";

import { useActionState, useMemo, useState } from "react";
import { ExplanationBody } from "@/components/explain";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { parseBRLToCents } from "@/lib/pricing/money";
import { submitObservation, type ObservationFormState } from "./actions";

function localNow(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ObservationForm({
  merchants,
  items,
}: {
  merchants: string[];
  items: string[];
}) {
  const [state, action, pending] = useActionState<ObservationFormState, FormData>(
    submitObservation,
    { errors: {} },
  );
  const [local, setLocal] = useState(localNow);
  const [money, setMoney] = useState({
    currentPrice: "",
    deliveryFee: "",
    serviceFee: "",
    discountValue: "",
  });

  // Same pure function the server uses at ingestion — this is only a preview.
  const preview = useMemo(() => {
    const c = Object.fromEntries(
      Object.entries(money).map(([k, v]) => [k, v.trim() === "" ? 0 : parseBRLToCents(v)]),
    ) as Record<keyof typeof money, number | null>;
    if (Object.values(c).some((v) => v === null) || money.currentPrice.trim() === "") return null;
    return effectivePrice(c as Record<keyof typeof money, number>);
  }, [money]);

  const err = (k: string) =>
    state.errors[k] ? <span className="text-xs font-medium text-brand">{state.errors[k]}</span> : null;

  const moneyField = (name: keyof typeof money | "listPrice", label: string, required = false) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">
        {label}
        {required && " *"}
      </span>
      <input
        name={name}
        inputMode="decimal"
        placeholder="0,00"
        required={required}
        onChange={
          name === "listPrice"
            ? undefined
            : (e) => setMoney((m) => ({ ...m, [name]: e.target.value }))
        }
        className="rounded-xl border border-border px-3 py-2.5 tabular-nums"
      />
      {err(name)}
    </label>
  );

  return (
    <form action={action} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Estabelecimento *</span>
          <input name="merchant" list="merchants" required className="rounded-xl border border-border px-3 py-2.5" />
          <datalist id="merchants">
            {merchants.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {err("merchant")}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Item *</span>
          <input name="item" list="items" required className="rounded-xl border border-border px-3 py-2.5" />
          <datalist id="items">
            {items.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          {err("item")}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Onde foi visto (plataforma)</span>
          <input name="platform" placeholder="manual" className="rounded-xl border border-border px-3 py-2.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Observado em *</span>
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            required
            className="rounded-xl border border-border px-3 py-2.5"
          />
          {/* Sent as ISO with the browser's timezone applied. */}
          <input type="hidden" name="observedAt" value={local ? new Date(local).toISOString() : ""} />
          {err("observedAt")}
        </label>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {moneyField("listPrice", "Preço de lista", true)}
        {moneyField("currentPrice", "Preço atual", true)}
        {moneyField("deliveryFee", "Taxa de entrega")}
        {moneyField("serviceFee", "Taxa de serviço")}
        {moneyField("discountValue", "Descontos")}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Tipo de promoção</span>
          <input name="promotionType" placeholder="ex.: cupom, percent_off" className="rounded-xl border border-border px-3 py-2.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">ETA mín. (min)</span>
          <input name="deliveryEtaMin" inputMode="numeric" className="rounded-xl border border-border px-3 py-2.5" />
          {err("deliveryEtaMin")}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">ETA máx. (min)</span>
          <input name="deliveryEtaMax" inputMode="numeric" className="rounded-xl border border-border px-3 py-2.5" />
          {err("deliveryEtaMax")}
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-4">
          <span className="text-xs font-semibold text-muted">Notas (fonte, contexto)</span>
          <textarea name="notes" rows={2} className="rounded-xl border border-border px-3 py-2.5" />
        </label>
      </fieldset>

      {preview && (
        <div className="rounded-2xl bg-surface p-4">
          <ExplanationBody explanation={preview.explanation} />
        </div>
      )}

      {state.message && <p className="text-sm font-semibold text-brand">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? "Salvando…" : "Salvar observação"}
      </button>
    </form>
  );
}
