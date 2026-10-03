export interface DeliveryResult {
  delivered: boolean;
  error?: string;
}

export interface Notifier {
  readonly channel: "TELEGRAM" | "CONSOLE";
  send(text: string, chatId?: string | null): Promise<DeliveryResult>;
}

/** Fallback when no Telegram token is configured: logs instead of sending. */
export class ConsoleNotifier implements Notifier {
  readonly channel = "CONSOLE" as const;
  async send(text: string): Promise<DeliveryResult> {
    console.info(`[alert]\n${text}`);
    return { delivered: true };
  }
}

/**
 * Telegram Bot API, method sendMessage (https://core.telegram.org/bots/api#sendmessage).
 * Plain text, no parse_mode, so prices and symbols need no escaping.
 */
export class TelegramNotifier implements Notifier {
  readonly channel = "TELEGRAM" as const;

  constructor(
    private readonly token: string,
    private readonly defaultChatId: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(text: string, chatId?: string | null): Promise<DeliveryResult> {
    const target = chatId || this.defaultChatId;
    if (!target) return { delivered: false, error: "No Telegram chat id configured" };
    try {
      const res = await this.fetchImpl(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: target, text, disable_web_page_preview: true }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { delivered: false, error: `Telegram HTTP ${res.status}: ${body.slice(0, 300)}` };
      }
      return { delivered: true };
    } catch (e) {
      return { delivered: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Picks the notifier from environment variables. Tokens never live in code or DB. */
export function notifierFromEnv(
  env: Record<string, string | undefined> = process.env,
): Notifier {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return new ConsoleNotifier();
  return new TelegramNotifier(token, env.TELEGRAM_DEFAULT_CHAT_ID?.trim() || undefined);
}
