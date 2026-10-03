import { connection } from "next/server";
import { listItems } from "@/lib/db/queries";
import { ObservationForm } from "./observation-form";

export default async function NewObservationPage() {
  await connection();
  const items = await listItems();
  const merchants = [...new Set(items.map((i) => i.merchant.name))];
  const itemNames = [...new Set(items.map((i) => i.name))];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Registrar observação</h1>
        <p className="text-sm text-muted">
          Entrada manual via <code className="font-mono">ManualCollector</code>. A observação é gravada como está e
          nunca é alterada depois; o preço efetivo é calculado e congelado na gravação.
        </p>
      </div>
      <ObservationForm merchants={merchants} items={itemNames} />
    </div>
  );
}
