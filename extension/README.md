# theifoodprice: browser companion (Manifest V3)

A personal overlay for Chrome and Chromium. While you browse iFood normally, it reads the
product you have open **from the visible page**. When you click, it records the price in
your local theifoodprice backend and shows the explained statistical analysis.

> Personal and **unofficial**. Not affiliated with iFood. The card says so and is styled
> as theifoodprice, not as part of the site.

## What it does and does not do

| Does | Does not |
| --- | --- |
| Read text visible in the page DOM, plus the page URL path | Read cookies, localStorage, auth tokens or request headers |
| Send a capture **only when you click "Registrar preço"** | Collect automatically or in the background |
| Talk only to your backend on `http://localhost` / `127.0.0.1` | Call any iFood API or undocumented endpoint |
| Show what it read and how confident it is | Claim a value it could not read confidently |
| | Touch forms, the cart or checkout |

Manifest permissions are `storage` (backend URL and token) and host access to `localhost`
and `127.0.0.1` only. The content script runs on `https://www.ifood.com.br/*` with no
extra permissions. There is no `cookies`, `webRequest`, `tabs` or `scripting` permission.
All network requests come from the service worker with `credentials: "omit"`, so nothing
from the page's context travels with them.

## Setup

```bash
# backend (repo root)
echo 'INGEST_API_TOKEN="choose-a-long-random-token"' >> .env
npm run dev                      # http://localhost:3000

# extension
npm run ext:build                # → extension/dist
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the
   `extension/` folder.
2. Click the extension's toolbar icon to open its options. Set the backend URL and the same
   token, then click **Testar conexão**.
3. Open a product on iFood. When the card shows a price, check it and click **Registrar preço**.

Use `npm run ext:watch` while developing, and reload the extension in `chrome://extensions`
after each rebuild.

## Architecture

```
extension/
  manifest.json
  options.html
  src/
    content.ts            watches the DOM (debounced), shows the card, sends on click
    background.ts         service worker: the only code that makes network requests
    messages.ts           content ↔ background message types
    extractors/
      site.ts             ← ALL site-specific selectors, patterns and confidences
      dom.ts              generic DOM helpers (visibility, strike-through, JSON-LD)
      scope.ts            finds the container showing a single product
      item.ts             item name / id
      merchant.ts         merchant name / id (from URL path)
      price.ts            current price, list price, displayed discount
      context.ts          promotion text, delivery fee, ETA
      index.ts            extractPage() and toBrowserPayload()
    overlay/
      PriceOverlay.ts     floating card in a closed Shadow DOM
      styles.ts
    api/
      client.ts           backend client (localhost only)
  test/                   Vitest + jsdom, synthetic fixtures
```

### Extractor contract

Every extractor returns `{ value, selectorUsed, confidence }`, or `null` when the value cannot
be determined confidently. Anything below **0.6** (`MIN_EXTRACTION_CONFIDENCE`, shared with the
backend) is dropped.

Strategies, in order:

1. **schema.org JSON-LD** (`Product`, `Restaurant`…), when present: confidence 0.9.
2. **Generic semantics**: the visible `[role="dialog"]`, its first heading as the item name, and
   `R$ 00,00` texts inside it. A struck-through price is the list price.
   - A single price candidate gets 0.75.
   - **Several distinct candidates (e.g. add-ons) count as ambiguous**, fall below the floor and return
     null. The card then says "Preço não identificado com segurança" and disables the button.
3. **Page URL**: a UUID path segment becomes the merchant's `externalRef` (0.7).

The overall capture confidence is the **minimum** of the required fields: item, current price and
a merchant identity.

**Calibration status.** The selectors have not yet been checked against the live iFood DOM. To
calibrate, edit only `extractors/site.ts`, add the verified selector with a higher confidence,
note the date it was checked, and add a fixture test.

## Backend endpoints used

| Endpoint | Purpose |
| --- | --- |
| `GET /api/collect/browser` | Connection check (options page) |
| `POST /api/collect/browser` | Raw browser observation. The backend validates it and converts it to a `PriceObservation`. |
| `GET /api/items/:id/analysis?w=30d` | Explained analysis shown in the card after capture |

All three require `Authorization: Bearer $INGEST_API_TOKEN`.

The conversion rules (in `lib/ingestion/browser.ts`, tested):

- confidence must be ≥ 0.6;
- `currentPrice` and an item and merchant identity are required;
- `listPrice` defaults to `currentPrice` and is never lower;
- `discountValue = 0`, because a displayed item discount is already reflected in `currentPrice`;
- an unobserved delivery fee is stored as 0, **with a warning** in `notes` and shown in the card;
- query strings are stripped from the stored page URL;
- the full raw payload is kept in `rawPayload`.

## Testing

```bash
npm test                 # includes extension/test (extractors, contract, client, overlay)
npm run ext:typecheck
```

The fixtures are **synthetic HTML** written for the tests. They are not captured from iFood. An
end-to-end check was also run in Chromium: it loaded the unpacked extension, served a
synthetic page at an iFood URL through request interception (so no request reached iFood),
went through options → preview → capture → analysis → dashboard, and checked the result in
the database. To click inside the card, that test builds with `TFP_SHADOW_MODE=open`. Normal
builds use a closed shadow root.

## Not in this phase

- Automatic collection
- Selectors calibrated against the live site
- Letting the user pick the price element by clicking it, as a fallback when extraction is ambiguous
