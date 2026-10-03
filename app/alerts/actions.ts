"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { alertRuleFormSchema } from "@/lib/pricing/alert-form";

export interface RuleFormState {
  errors: Record<string, string>;
  ok?: boolean;
}

export async function createRule(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const parsed = alertRuleFormSchema.safeParse(
    Object.fromEntries([...formData.entries()].map(([k, v]) => [k, v.toString()])),
  );
  if (!parsed.success) {
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  await db().alertRule.create({ data: parsed.data });
  revalidatePath("/alerts");
  return { errors: {}, ok: true };
}

export async function toggleRule(formData: FormData) {
  const id = String(formData.get("id"));
  const rule = await db().alertRule.findUniqueOrThrow({ where: { id } });
  await db().alertRule.update({ where: { id }, data: { active: !rule.active } });
  revalidatePath("/alerts");
}

export async function deleteRule(formData: FormData) {
  await db().alertRule.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/alerts");
}
