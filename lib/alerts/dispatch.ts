import { db } from "@/lib/db/client";
import { ACTIVE_OBSERVATION } from "@/lib/db/queries";
import { analyzePrices } from "@/lib/pricing/analysis";
import { evaluateAlert } from "@/lib/pricing/alerts";
import { isWindowKey, WINDOWS, type WindowKey } from "@/lib/pricing/windows";
import { formatAlertMessage } from "@/lib/telegram/format";
import { ConsoleNotifier, notifierFromEnv, type Notifier } from "@/lib/telegram/notifier";

/**
 * Evaluates every active rule of the given items against fresh analyses
 * and delivers the ones that fire. Returns the number of alerts fired.
 */
export async function dispatchAlertsForItems(
  itemIds: readonly string[],
  now: Date = new Date(),
  notifier: Notifier = notifierFromEnv(),
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const prisma = db();
  const rules = await prisma.alertRule.findMany({
    where: { itemId: { in: [...itemIds] }, active: true },
    include: { item: { include: { merchant: true } } },
  });
  if (rules.length === 0) return 0;

  const maxWindow = Math.max(...rules.map((r) => WINDOWS[asWindow(r.window)]));
  const observations = await prisma.priceObservation.findMany({
    where: {
      itemId: { in: [...new Set(rules.map((r) => r.itemId))] },
      observedAt: { gt: new Date(now.getTime() - maxWindow), lte: now },
      ...ACTIVE_OBSERVATION,
    },
    select: { id: true, itemId: true, observedAt: true, effectivePrice: true },
  });

  let fired = 0;
  for (const rule of rules) {
    const window = asWindow(rule.window);
    const analysis = analyzePrices(
      observations.filter((o) => o.itemId === rule.itemId),
      window,
      now,
    );
    const decision = evaluateAlert(rule, analysis, now);
    if (!decision.value || !analysis.current?.id) continue;

    const message = formatAlertMessage({
      itemName: rule.item.name,
      merchantName: rule.item.merchant.name,
      ruleType: rule.type,
      analysis,
    });
    const sender = rule.channel === "CONSOLE" ? new ConsoleNotifier() : notifier;
    const result = await sender.send(message, rule.telegramChatId);

    await prisma.$transaction([
      prisma.alertEvent.create({
        data: {
          ruleId: rule.id,
          observationId: analysis.current.id,
          message,
          delivered: result.delivered,
          deliveryError: result.error,
        },
      }),
      prisma.alertRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: now } }),
    ]);
    fired++;
  }
  return fired;
}

function asWindow(w: string): WindowKey {
  return isWindowKey(w) ? w : "30d";
}
