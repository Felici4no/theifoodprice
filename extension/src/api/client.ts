import type { BrowserObservationInput } from "@/lib/ingestion/browser";
import type { Explained } from "@/lib/statistics";

/**
 * Talks to the user's own theifoodprice backend — never to the visited site.
 * Requests carry only Content-Type and the backend token; no cookies
 * (credentials: "omit") and nothing copied from the page's requests.
 */

export interface ExtensionConfig {
  backendUrl: string;
  token: string;
}

export const DEFAULT_BACKEND_URL = "http://localhost:3000";

/** Matches the manifest's host_permissions: local backends only. */
export function isAllowedBackendUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export interface CollectResponse {
  observationId: string;
  itemId: string;
  warnings: string[];
  alertsFired: number;
}

/** Shape of GET /api/items/:id/analysis (Explained objects from the statistics engine). */
export interface AnalysisResponse {
  item: { id: string; name: string; merchantName: string; platform: string };
  window: string;
  methodologyVersion: string;
  computedAt: string;
  historySize: number;
  currentPrice: Explained<number> | null;
  median: Explained<number | null>;
  diffFromMedian: Explained<number | null>;
  percentileRank: Explained<number | null>;
  isNewLow: Explained<boolean | null>;
  label: Explained<string> & { text: string };
  dashboardPath: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createApiClient(config: ExtensionConfig, fetchImpl: typeof fetch = fetch) {
  if (!isAllowedBackendUrl(config.backendUrl)) {
    throw new ApiError("Backend URL must be http://localhost or http://127.0.0.1", 0);
  }
  const base = config.backendUrl.replace(/\/+$/, "");

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        ...init,
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          authorization: `Bearer ${config.token}`,
        },
      });
    } catch (e) {
      throw new ApiError(`Backend inacessível em ${base} (${e instanceof Error ? e.message : e})`, 0);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
    return body as T;
  }

  return {
    ping: () => call<{ ok: true; minConfidence: number }>("/api/collect/browser"),
    collect: (payload: BrowserObservationInput) =>
      call<CollectResponse>("/api/collect/browser", { method: "POST", body: JSON.stringify(payload) }),
    analysis: (itemId: string, window = "30d") =>
      call<AnalysisResponse>(`/api/items/${encodeURIComponent(itemId)}/analysis?w=${window}`),
    dashboardUrl: (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`,
  };
}

export async function loadConfig(): Promise<ExtensionConfig | null> {
  const { backendUrl, token } = await chrome.storage.local.get(["backendUrl", "token"]);
  if (typeof token !== "string" || !token) return null;
  return {
    backendUrl: typeof backendUrl === "string" && backendUrl ? backendUrl : DEFAULT_BACKEND_URL,
    token,
  };
}
