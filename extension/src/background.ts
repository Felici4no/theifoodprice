import { ApiError, createApiClient, loadConfig } from "./api/client";
import type { CaptureResponse, Request } from "./messages";
import { isSupportedHost } from "./extractors/site";

/**
 * Service worker: the only place that performs network requests.
 * It talks exclusively to the configured local backend.
 */

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  // Accept messages only from our own content script on a supported page.
  const tabUrl = sender.tab?.url;
  if (sender.id !== chrome.runtime.id || !tabUrl || !isSupportedHost(new URL(tabUrl).hostname)) {
    return false;
  }

  if (msg.type === "capture") {
    capture(msg.payload).then(sendResponse);
    return true; // async response
  }
  if (msg.type === "openDashboard") {
    loadConfig().then((config) => {
      if (!config) return chrome.runtime.openOptionsPage();
      chrome.tabs.create({ url: createApiClient(config).dashboardUrl(msg.path) });
    });
  }
  return false;
});

async function capture(payload: Extract<Request, { type: "capture" }>["payload"]): Promise<CaptureResponse> {
  const config = await loadConfig();
  if (!config) {
    return { ok: false, needsSetup: true, error: "Configure a URL do backend e o token nas opções da extensão." };
  }
  try {
    const api = createApiClient(config);
    const collected = await api.collect(payload);
    const analysis = await api.analysis(collected.itemId);
    return { ok: true, itemId: collected.itemId, warnings: collected.warnings, analysis };
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
    return { ok: false, error: err.message, needsSetup: err.status === 401 || err.status === 503 };
  }
}
