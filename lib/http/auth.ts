/**
 * Bearer-token guard for the machine-facing API (scripts, browser extension).
 * Returns an error Response, or null when the request may proceed.
 * The API is disabled entirely while INGEST_API_TOKEN is unset.
 */
export function requireApiToken(request: Request): Response | null {
  const token = process.env.INGEST_API_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "API disabled: set INGEST_API_TOKEN." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
