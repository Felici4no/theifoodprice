# theifoodprice

A personal laboratory for food-delivery **price intelligence**. It tracks prices of
delivery products over time and answers one question with descriptive statistics:

> **Is this price historically good?**

A later phase will ask whether waiting is statistically favorable. This phase only
describes the past.

> Personal, independent project. **Not affiliated with iFood** or any delivery
> platform, and it does not pretend to be one. The app has no scrapers and calls no
> platform APIs. Data comes in only through the collectors described below.

---

## Product principle: every number is explainable

Any calculated metric in the UI (median, percentile, z-score, difference vs median,
data coverage, alert decisions, and so on) opens an explanation: hover on desktop,
tap on mobile. The explanation shows:

1. what the metric means;
2. the exact formula;
3. the actual values plugged in;
4. sample size (n);
5. time window;
6. the last update (timestamp of the newest observation used).

Every function in `lib/statistics` and `lib/pricing` returns this shape:

```ts
{
  value: -13.55,
  explanation: {
    name: "Diferença vs mediana",
    description: "...",
    formula: "(current − median) / median × 100",
    variables: { current: 3190, median: 3690 },
    variableUnits: { current: "cents", median: "cents" },
    unit: "percent",
    sampleSize: 84,
    window: "30d",
    lastUpdatedAt: "2026-10-01T12:00:00.000Z",
    notes: []
  }
}
```

The UI component `<Explain>` renders that object as-is. **The front end never
recomputes a metric.**

---

## Stack

Next.js 16 (App Router) · TypeScript (strict) · PostgreSQL · Prisma 7 (`@prisma/adapter-pg`)
· Tailwind CSS 4 · Recharts · Zod · Vitest · Telegram Bot API.

## Getting started

```bash
cp .env.example .env            # set DATABASE_URL
npm install                     # also runs `prisma generate`
npm run db:migrate              # creates tables + append-only trigger
npm run db:seed                 # OPTIONAL: synthetic demo data (see below)
npm run dev                     # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm test` | Unit tests (statistics, pricing, ingestion, Telegram formatting) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio |
| `npm run ext:build` | Build the browser extension into `extension/dist` |

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | no | Bot token from @BotFather. Without it, alerts are logged to the server console. |
| `TELEGRAM_DEFAULT_CHAT_ID` | no | Chat that receives alerts when a rule has none of its own |
| `INGEST_API_TOKEN` | no | Enables `POST /api/observations` (Bearer auth). The endpoint is disabled when unset. |

The app has **no user authentication**. Run it locally or behind private access.

---

## Architecture

```
app/                 Next.js routes (server components read the DB)
  page.tsx           Home: pricing cards
  history/           Analytical chart + stats + raw observations
  explore/           All items ranked vs their own history
  alerts/            Rules, live evaluation, event log
  data/              Data volume, coverage, gaps, quality; manual entry form (data/new)
  api/observations/  Token-protected ingestion endpoint
components/          UI (Explain tooltip, cards, chart…)
lib/
  statistics/        Pure descriptive statistics, each returning Explained<T>
  pricing/           Pure domain: effective price, item analysis, labels, data quality,
                     alert rules, chart preparation, formatting
  ingestion/         PriceCollector interface, ManualCollector, ingest() write path
  alerts/            Dispatch: analysis → rule evaluation → notifier → AlertEvent
  telegram/          Notifier abstraction, Telegram + console implementations, message format
  db/                Prisma client, read queries, PriceAnalysis snapshots
prisma/              Schema, migrations, demo seed
```

Dependencies point one way: `statistics` ← `pricing` ← (`ingestion`, `alerts`,
`telegram`, `db`) ← `app`. `statistics` and `pricing` have no I/O and know nothing
about Prisma or React, so they are easy to test and to port to Python later.

### Data model

| Entity | Role |
| --- | --- |
| `Merchant` | Where an item is sold. `platform` is free text ("manual", "demo"…), not an integration. |
| `Item` | A product at a merchant. |
| `PriceObservation` | **Raw, immutable** price sighting. |
| `PriceAnalysis` | **Derived** snapshot per item and window, safe to delete and recompute. |
| `AlertRule` | User-defined condition. |
| `AlertEvent` | Audit log of every fired alert, including failed deliveries. |

**Raw vs derived.** Observations keep every collected component: `listPrice`,
`currentPrice`, `deliveryFee`, `serviceFee`, `discountValue`, `promotionType`,
`deliveryEtaMin/Max`, `source`, `rawPayload`, `observedAt` (when the price was seen)
and `collectedAt` (when it was stored). Derived numbers never overwrite them.

**Append-only is enforced by the database.** A trigger rejects `UPDATE` and `DELETE` on
`PriceObservation`. To correct a mistake, insert a new row whose `supersedesId` points at
the wrong one. Every analysis ignores superseded rows, and the history stays auditable.
CHECK constraints keep cents non-negative and enforce the effective-price formula.

**Money** is always an integer number of cents (BRL). Statistics such as a median of an
even sample can produce fractional cents. They are stored as `Float` in `PriceAnalysis`
and rounded only for display.

### Ingestion

```ts
interface PriceCollector {
  readonly source: string;
  collect(): Promise<RawPriceObservation[]>;
}
```

`ManualCollector` is the only implementation for now. It validates (Zod) and queues
observations submitted through the `/data/new` form or `POST /api/observations`.
`ingest()` then:

1. finds or creates the merchant and item by name;
2. computes and freezes `effectivePrice`;
3. **inserts** observations (never updates);
4. records `PriceAnalysis` snapshots for 24h/7d/30d/90d;
5. evaluates alert rules for the affected items.

New collectors must use legitimate, documented data sources. None are included,
and no platform endpoints are assumed.

Example API call (prices in cents):

```bash
curl -X POST localhost:3000/api/observations \
  -H "Authorization: Bearer $INGEST_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"observedAt":"2026-10-01T19:30:00-03:00",
       "merchant":{"name":"Lanchonete X"},"item":{"name":"Combo 1"},
       "listPrice":3990,"currentPrice":3590,"deliveryFee":599,"serviceFee":99}'
```

### Browser companion extension

`extension/` contains a Manifest V3 extension. While you browse iFood, it reads the product
you have open **from the visible DOM**. When you click "Registrar preço", it sends a raw
observation to `POST /api/collect/browser` and shows the explained analysis from
`GET /api/items/:id/analysis`. It never reads cookies or tokens and never collects
automatically. See [`extension/README.md`](extension/README.md).

### Demo data

`npm run db:seed` inserts deterministic **synthetic** data: four merchants on platform
`demo`, observations with source `demo-seed`, and deliberate collection gaps. Cards show
a "DEMO" badge, and the Data page reports how many observations are synthetic. Reset with
`npx prisma migrate reset`.

---

## Methodology (v1.0.0)

Every `PriceAnalysis` stores `methodologyVersion`. Bump `METHODOLOGY_VERSION` in
`lib/pricing/analysis.ts` whenever a rule below changes.

### Effective price

```
effectivePrice = max(0, currentPrice + deliveryFee + serviceFee − discountValue)
```

This is computed once at ingestion and stored with the observation. "Applicable
discounts" are whatever the collector recorded in `discountValue`.

### Current price vs history

For a window *W* (24h, 7d, 30d, 90d) ending now:

- **current** = the most recent observation in *W*;
- **history** = all *other* observations in *W* (strictly earlier).

All reference statistics (median, percentiles, mean, standard deviation, min, max) are
computed on the **history only**. Including the current price would pull the reference
toward it and make "new historical low" ill-defined. The window is half-open, `(now − W, now]`.

### Statistics

| Metric | Definition |
| --- | --- |
| Median | Middle value of sorted data; mean of the two middle values when n is even |
| Mean | Σxᵢ / n |
| Standard deviation | **Sample** (Bessel): √(Σ(xᵢ − x̄)² / (n − 1)); undefined for n < 2 |
| Percentiles P10–P90 | **Linear interpolation, Hyndman & Fan type 7**: h = (n − 1)·p, P = x₍⌊h⌋₎ + (h − ⌊h⌋)(x₍⌈h⌉₎ − x₍⌊h⌋₎). Same as `numpy.percentile` default and Excel `PERCENTILE.INC`. |
| Percentile rank | **Mid-rank**: (count below + 0.5 × count equal) / n × 100, so ties are split evenly |
| Z-score | (x − x̄) / s; undefined when s = 0. Prices are rarely normal, so it is shown as a relative measure, never as a probability. |
| Difference vs median | (current − median) / median × 100 |
| Price change % | (current − reference) / reference × 100; undefined when reference = 0 |
| Rolling median | Time-based trailing window (t − w, t]. Time-based because collection is irregular. Chart window: 3h (24h view), 24h (7d), 3d (30d), 7d (90d). |

Empty or too-small samples return `value: null` with an explanatory note, never a
fabricated number. Samples with n < 10 carry a "small sample" caveat.

Unit tests use deterministic fixtures whose expected values were cross-checked with numpy.

### Price labels

Labels are descriptive and avoid claiming certainty:

| Condition | Label |
| --- | --- |
| history n < 10 | Histórico insuficiente |
| percentile rank ≤ 25 | Preço historicamente baixo |
| percentile rank ≥ 75 | Preço historicamente alto |
| otherwise | Preço próximo da mediana |

### Data quality

Computed from observation timestamps in the selected window:

- **Collection frequency**: median interval between consecutive observations.
- **Missing periods**: intervals (including before the first and after the last
  observation) longer than `max(6h, 3 × median interval)`.
- **Time coverage**: days in the window with at least one observation ÷ days in the window.
- **Quality level** (a simple rule, not a statistical score):
  n = 0 → none; n ≥ 30 and coverage ≥ 70% → good; n ≥ 10 and coverage ≥ 30% → fair;
  otherwise poor.

### Alerts

| Type | Fires when |
| --- | --- |
| Absolute price | effective price ≤ threshold (R$) |
| Percentile | percentile rank ≤ threshold (%) |
| % below median | −(difference vs median) ≥ threshold (%) |
| New historical low | current < min(history in window) |

Statistical rules (all except absolute) require `minSampleSize` prior observations
(default 10). Each rule has a cooldown (default 6h). Evaluation is a pure function
(`lib/pricing/alerts.ts`) that returns an explained decision. The Alerts page shows,
for every rule, whether it would fire now and why.

Example Telegram message (plain text):

```
McOferta Média
Lanchonete Exemplo

R$ 27,90 agora
22,3% abaixo da mediana
Percentil: 7%

Mediana 30d: R$ 35,90
214 observações.

Regra: Percentual abaixo da mediana
Estatística descritiva do histórico coletado; não é previsão.
```

Telegram delivery uses the documented Bot API method
[`sendMessage`](https://core.telegram.org/bots/api#sendmessage). The token is read only
from the environment and is never stored in the database.

---

## Limitations and next steps

- Descriptive only: no forecasting, no "expected value of waiting" yet. Those need
  enough real data first, and their explanations will follow the same contract.
- Effective price treats the item price as the whole order. Minimum-order rules,
  multi-item orders and coupon eligibility are not modelled.
- Pages compute analyses on request. `PriceAnalysis` snapshots are an audit trail of
  what the system concluded at ingestion time. They are not used as a cache.
- No authentication. Single-user, local or private deployment assumed.
