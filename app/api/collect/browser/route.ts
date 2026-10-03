import { requireApiToken } from "@/lib/http/auth";
import {
  BROWSER_SOURCE,
  MIN_EXTRACTION_CONFIDENCE,
  browserObservationSchema,
  convertBrowserObservation,
} from "@/lib/ingestion/browser";
import { ingest } from "@/lib/ingestion/ingest";

/**
 * POST /api/collect/browser — one raw observation captured by the browser extension.
 * The extension sends what it read from the page; validation and conversion happen here.
 * Requires `Authorization: Bearer $INGEST_API_TOKEN`.
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

  const parsed = browserObservationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const converted = convertBrowserObservation(parsed.data);
  if (!converted.ok) {
    return Response.json({ error: converted.error }, { status: converted.status });
  }

  const result = await ingest([converted.observation], BROWSER_SOURCE);
  return Response.json(
    {
      observationId: result.observationIds[0],
      itemId: result.itemIds[0],
      warnings: converted.warnings,
      alertsFired: result.alertsFired,
    },
    { status: 201 },
  );
}

/** GET /api/collect/browser — connection check for the extension's options page. */
export async function GET(request: Request) {
  const denied = requireApiToken(request);
  if (denied) return denied;
  return Response.json({ ok: true, minConfidence: MIN_EXTRACTION_CONFIDENCE });
}
