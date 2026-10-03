import { loadItemAnalyses } from "@/lib/db/queries";
import { requireApiToken } from "@/lib/http/auth";
import { PRICE_LABEL_TEXT } from "@/lib/pricing/analysis";
import { DEFAULT_WINDOW, isWindowKey } from "@/lib/pricing/windows";

/**
 * GET /api/items/:id/analysis?w=30d — the same explained analysis the dashboard renders.
 * Every metric is an Explained<T> object; clients display, never recompute.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/items/[id]/analysis">) {
  const denied = requireApiToken(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const w = new URL(request.url).searchParams.get("w");
  const window = isWindowKey(w) ? w : DEFAULT_WINDOW;
  const [data] = await loadItemAnalyses(window, new Date(), { itemId: id });
  if (!data) return Response.json({ error: "Item not found" }, { status: 404 });

  const a = data.analysis;
  return Response.json({
    item: data.item,
    window,
    methodologyVersion: a.methodologyVersion,
    computedAt: a.computedAt,
    historySize: a.historySize,
    currentPrice: data.currentPrice,
    median: a.median,
    diffFromMedian: a.diffFromMedian,
    percentileRank: a.percentileRank,
    isNewLow: a.isNewLow,
    label: { ...a.label, text: PRICE_LABEL_TEXT[a.label.value] },
    dashboardPath: `/history?item=${data.item.id}&w=${window}`,
  });
}
