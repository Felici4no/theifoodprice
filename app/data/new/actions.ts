"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { parseObservationForm, type FormErrors } from "@/lib/ingestion/form";
import { runCollector } from "@/lib/ingestion/ingest";
import { ManualCollector } from "@/lib/ingestion/manual-collector";

export interface ObservationFormState {
  errors: FormErrors;
  message?: string;
}

export async function submitObservation(
  _prev: ObservationFormState,
  formData: FormData,
): Promise<ObservationFormState> {
  const { input, errors } = parseObservationForm((k) => formData.get(k)?.toString() ?? null);
  if (!input) return { errors, message: "Corrija os campos destacados." };

  const collector = new ManualCollector();
  let itemId: string;
  try {
    collector.submit(input);
    const result = await runCollector(collector);
    itemId = result.itemIds[0];
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        errors: Object.fromEntries(e.issues.map((i) => [String(i.path.at(-1)), i.message])),
        message: "Dados inválidos.",
      };
    }
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/history?item=${itemId}&saved=1`);
}
