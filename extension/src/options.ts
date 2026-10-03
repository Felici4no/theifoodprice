import { createApiClient, DEFAULT_BACKEND_URL, isAllowedBackendUrl } from "./api/client";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const urlInput = $<HTMLInputElement>("backendUrl");
const tokenInput = $<HTMLInputElement>("token");
const status = $<HTMLDivElement>("status");

function show(text: string, ok: boolean) {
  status.textContent = text;
  status.style.color = ok ? "#1a7f4b" : "#e5262e";
}

function read() {
  return { backendUrl: urlInput.value.trim() || DEFAULT_BACKEND_URL, token: tokenInput.value.trim() };
}

chrome.storage.local.get(["backendUrl", "token"]).then(({ backendUrl, token }) => {
  urlInput.value = typeof backendUrl === "string" ? backendUrl : DEFAULT_BACKEND_URL;
  tokenInput.value = typeof token === "string" ? token : "";
});

$("save").addEventListener("click", async () => {
  const cfg = read();
  if (!isAllowedBackendUrl(cfg.backendUrl)) return show("Use http://localhost ou http://127.0.0.1.", false);
  if (!cfg.token) return show("Informe o token.", false);
  await chrome.storage.local.set(cfg);
  show("Salvo.", true);
});

$("test").addEventListener("click", async () => {
  try {
    const r = await createApiClient(read()).ping();
    show(`Conectado. Confiança mínima exigida pelo backend: ${r.minConfidence}.`, true);
  } catch (e) {
    show(`Falhou: ${e instanceof Error ? e.message : e}`, false);
  }
});
