import { ZodError } from "zod";
import { requireApiToken } from "@/lib/http/auth";
import { runCollector } from "@/lib/ingestion/ingest";
import { ManualCollector } from "@/lib/ingestion/manual-collector";
import type { RawPriceObservationInput } from "@/lib/ingestion/types";

/**
 * POST /api/observations — manual ingestion for scripts.
 * Body: one RawPriceObservation or an array (prices in integer cents).
 * Requires `Authorization: Bearer $INGEST_API_TOKEN`; disabled when the token is unset.
 */
export async function POST(request: Request) {
  const denied = requireApiToken(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const inputs = (Array.isArray(body) ? body : [body]) as RawPriceObservationInput[];

  const collector = new ManualCollector();
  try {
    collector.submit(...inputs);
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: "Validation failed", issues: e.issues }, { status: 400 });
    throw e;
  }
  const result = await runCollector(collector);
  return Response.json(result, { status: 201 });
}
