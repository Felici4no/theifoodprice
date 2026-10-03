"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Explanation } from "@/lib/statistics";
import { formatAgo, formatDateTime, formatValue } from "@/lib/pricing/format";

/**
 * Wraps any value with its explanation.
 * Desktop (fine pointer): hover or focus opens a popover.
 * Touch: tap opens a bottom sheet.
 * It only renders `explanation`; it never recomputes anything.
 */
export function Explain({
  explanation,
  children,
  className = "",
}: {
  explanation: Explanation;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoverMode, setHoverMode] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHoverMode(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 352;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 8;
    const top = below + 320 > window.innerHeight && r.top > 340 ? r.top - 8 - 320 : below;
    setPos({ top, left });
  }, []);

  const show = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }, [place]);

  const hideSoon = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => hoverMode && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, hoverMode]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Explicar: ${explanation.name}`}
        className={`explainable text-left ${className}`}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && hideSoon()}
        onFocus={() => hoverMode && show()}
        onBlur={() => hoverMode && hideSoon()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open && !hoverMode) setOpen(false);
          else show();
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          hoverMode ? (
            <div
              id={id}
              role="tooltip"
              style={{ top: pos?.top, left: pos?.left }}
              className="fixed z-50 w-[352px] max-h-[320px] overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-xl"
              onPointerEnter={show}
              onPointerLeave={hideSoon}
            >
              <ExplanationBody explanation={explanation} />
            </div>
          ) : (
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" id={id}>
              <button
                type="button"
                aria-label="Fechar"
                className="absolute inset-0 bg-black/30"
                onClick={() => setOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
                <ExplanationBody explanation={explanation} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 w-full rounded-full bg-surface py-3 text-sm font-semibold"
                >
                  Entendi
                </button>
              </div>
            </div>
          ),
          document.body,
        )}
    </>
  );
}

export function ExplanationBody({ explanation: e }: { explanation: Explanation }) {
  const vars = Object.entries(e.variables);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-semibold">{e.name}</p>
        <p className="mt-1 text-muted">{e.description}</p>
      </div>

      <Section title="Fórmula">
        <code className="block whitespace-pre-wrap break-words rounded-lg bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed">
          {e.formula}
        </code>
      </Section>

      {vars.length > 0 && (
        <Section title="Valores usados">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {vars.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-[12px] text-muted">{k}</dt>
                <dd className="text-right tabular-nums">{formatValue(v, e.variableUnits?.[k])}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-2.5 text-center">
        <Meta label="Amostra" value={`n = ${e.sampleSize}`} />
        <Meta label="Janela" value={e.window ?? "—"} />
        <Meta
          label="Atualizado"
          value={e.lastUpdatedAt ? formatAgo(e.lastUpdatedAt) : "—"}
          title={e.lastUpdatedAt ? formatDateTime(e.lastUpdatedAt) : undefined}
        />
      </dl>
      {e.lastUpdatedAt && (
        <p className="text-[11px] text-muted">Última observação usada: {formatDateTime(e.lastUpdatedAt)}</p>
      )}

      {e.notes && e.notes.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn-soft p-2.5 text-[12px] text-warn">
          {e.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-[13px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
