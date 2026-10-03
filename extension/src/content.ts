import { extractPage, toBrowserPayload, type PageExtraction } from "./extractors";
import { isSupportedHost } from "./extractors/site";
import type { CaptureResponse, Request } from "./messages";
import { PriceOverlay } from "./overlay/PriceOverlay";

/**
 * Content script. Reads visible page content only; it never reads cookies or
 * storage, never touches forms or checkout, and never sends anything on its own:
 * a capture happens only when the user clicks "Registrar preço".
 */

const DEBOUNCE_MS = 400;

function keyOf(e: PageExtraction): string | null {
  if (!e.item) return null;
  return [e.merchantName?.value ?? e.merchantRef?.value, e.item.value.name, e.pricing.currentPrice?.value].join("|");
}

function send(msg: Request): Promise<CaptureResponse> {
  return chrome.runtime.sendMessage(msg);
}

function start() {
  let current: PageExtraction | null = null;
  let currentKey: string | null = null;
  let dismissedKey: string | null = null;

  const overlay = new PriceOverlay({
    onCapture: async () => {
      if (!current?.supported) return;
      const payload = toBrowserPayload(current, location.href, new Date());
      overlay.showSubmitting();
      try {
        const res = await send({ type: "capture", payload });
        if (res.ok) overlay.showResult(res.analysis, res.warnings);
        else overlay.showError(res.error);
      } catch {
        overlay.showError("Extensão recarregada ou indisponível. Recarregue a página.");
      }
    },
    onOpenDashboard: (path) => void send({ type: "openDashboard", path }).catch(() => undefined),
  });

  const scan = () => {
    const e = extractPage(document, location);
    const key = keyOf(e);

    if (key === null) {
      // Product no longer visible: drop the preview, keep a result until a new product appears.
      if (overlay.phase === "preview") overlay.hide();
      current = null;
      currentKey = null;
      return;
    }
    if (key === currentKey) return;
    if (overlay.phase === "submitting") return;

    current = e;
    currentKey = key;
    if (key === dismissedKey) return;
    overlay.showPreview(e);
  };

  // Remember a dismissal so the card does not reappear for the same product.
  overlay.host.addEventListener("click", () => {
    queueMicrotask(() => {
      if (overlay.phase === "hidden") dismissedKey = currentKey;
    });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, DEBOUNCE_MS);
  };
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, characterData: true });
  scan();
}

if (isSupportedHost(location.hostname)) start();
