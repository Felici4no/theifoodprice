import { z } from "zod";
import { parseBRLToCents } from "./money";
import { WINDOW_KEYS } from "./windows";

export const alertRuleFormSchema = z
  .object({
    itemId: z.string().min(1, "Escolha um item"),
    type: z.enum(["ABSOLUTE_PRICE", "PERCENTILE", "BELOW_MEDIAN_PCT", "NEW_HISTORICAL_LOW"]),
    thresholdBRL: z.string().optional(),
    thresholdPercent: z.string().optional(),
    window: z.enum(WINDOW_KEYS as [string, ...string[]]),
    minSampleSize: z.coerce.number().int().min(1).max(10_000),
    cooldownMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30),
    channel: z.enum(["TELEGRAM", "CONSOLE"]),
    telegramChatId: z.string().trim().optional(),
  })
  .transform((v, ctx) => {
    let thresholdCents: number | null = null;
    let thresholdPercent: number | null = null;
    if (v.type === "ABSOLUTE_PRICE") {
      thresholdCents = parseBRLToCents(v.thresholdBRL ?? "");
      if (thresholdCents === null) {
        ctx.addIssue({ code: "custom", path: ["thresholdBRL"], message: "Informe um valor em R$" });
        return z.NEVER;
      }
    }
    if (v.type === "PERCENTILE" || v.type === "BELOW_MEDIAN_PCT") {
      const p = Number((v.thresholdPercent ?? "").replace(",", "."));
      if (!(p > 0 && p <= 100)) {
        ctx.addIssue({ code: "custom", path: ["thresholdPercent"], message: "Entre 0 e 100" });
        return z.NEVER;
      }
      thresholdPercent = p;
    }
    return {
      itemId: v.itemId,
      type: v.type,
      thresholdCents,
      thresholdPercent,
      window: v.window,
      minSampleSize: v.minSampleSize,
      cooldownMinutes: v.cooldownMinutes,
      channel: v.channel,
      telegramChatId: v.telegramChatId || null,
    };
  });
