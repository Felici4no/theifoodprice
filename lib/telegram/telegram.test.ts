import { describe, expect, it, vi } from "vitest";
import { analyzePrices } from "@/lib/pricing/analysis";
import { DAY_MS } from "@/lib/pricing/windows";
import { formatAlertMessage } from "./format";
import { ConsoleNotifier, notifierFromEnv, TelegramNotifier } from "./notifier";

const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("formatAlertMessage", () => {
  it("states price, distance from median, percentile, window and n", () => {
    // 20 prior prices, all 3590 except two at 3790, then current 2790.
    const prices = [...Array(18).fill(3590), 3790, 3790, 2790];
    const obs = prices.map((p, i) => ({
      observedAt: new Date(NOW.getTime() - (prices.length - 1 - i) * DAY_MS),
      effectivePrice: p,
    }));
    const text = formatAlertMessage({
      itemName: "McOferta Média",
      merchantName: "Lanchonete Exemplo",
      ruleType: "BELOW_MEDIAN_PCT",
      analysis: analyzePrices(obs, "30d", NOW),
    });
    expect(text).toBe(
      [
        "McOferta Média",
        "Lanchonete Exemplo",
        "",
        "R$ 27,90 agora",
        "22,3% abaixo da mediana",
        "Percentil: 0%",
        "Menor preço da janela",
        "",
        "Mediana 30d: R$ 35,90",
        "20 observações.",
        "",
        "Regra: Percentual abaixo da mediana",
        "Estatística descritiva do histórico coletado; não é previsão.",
      ].join("\n"),
    );
  });
});

describe("notifiers", () => {
  it("falls back to console without a token", () => {
    expect(notifierFromEnv({})).toBeInstanceOf(ConsoleNotifier);
    expect(notifierFromEnv({ TELEGRAM_BOT_TOKEN: "x" })).toBeInstanceOf(TelegramNotifier);
  });

  it("calls sendMessage with the configured chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const n = new TelegramNotifier("TOKEN", "123", fetchMock as unknown as typeof fetch);
    const r = await n.send("hi");
    expect(r.delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: "123", text: "hi" });
  });

  it("reports HTTP errors without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    const n = new TelegramNotifier("T", "1", fetchMock as unknown as typeof fetch);
    expect(await n.send("x")).toEqual({ delivered: false, error: "Telegram HTTP 401: bad" });
  });

  it("requires a chat id", async () => {
    const n = new TelegramNotifier("T", undefined, vi.fn() as unknown as typeof fetch);
    expect((await n.send("x")).delivered).toBe(false);
  });
});
