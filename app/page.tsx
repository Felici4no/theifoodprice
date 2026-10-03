import Link from "next/link";
import { connection } from "next/server";
import { PriceCard } from "@/components/price-card";
import { WindowTabs } from "@/components/window-tabs";
import { loadItemAnalyses } from "@/lib/db/queries";
import { DEFAULT_WINDOW, isWindowKey } from "@/lib/pricing/windows";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  const sp = await searchParams;
  const window = isWindowKey(sp.w) ? sp.w : DEFAULT_WINDOW;
  const now = new Date();
  const items = await loadItemAnalyses(window, now, { trackedOnly: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Este preço é historicamente bom?</h1>
          <p className="text-sm text-muted">
            Toque ou passe o mouse em qualquer número para ver a fórmula e os dados usados.
          </p>
        </div>
        <WindowTabs current={window} hrefFor={(w) => `/?w=${w}`} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl bg-surface p-6 text-center">
          <p className="font-semibold">Nenhum item rastreado ainda.</p>
          <p className="mt-1 text-sm text-muted">
            Registre uma observação manual ou rode <code className="font-mono">npm run db:seed</code> para dados de demonstração.
          </p>
          <Link
            href="/data/new"
            className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            Registrar observação
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <PriceCard key={d.item.id} data={d} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
