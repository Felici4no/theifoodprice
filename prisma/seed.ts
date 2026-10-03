/**
 * DEMO DATA ONLY.
 * Deterministic synthetic observations so the UI has something to show.
 * Merchants live on platform "demo" and observations have source "demo-seed",
 * so they are clearly distinguishable from real collected data.
 *
 * Run: npm run db:seed   (refuses to run twice)
 */
import "dotenv/config";
import { db } from "@/lib/db/client";
import { ingest } from "@/lib/ingestion/ingest";
import { rawPriceObservationSchema, type RawPriceObservation } from "@/lib/ingestion/types";
import { DAY_MS, HOUR_MS } from "@/lib/pricing/windows";

/** Mulberry32: tiny deterministic PRNG. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  merchant: string;
  item: string;
  base: number; // cents
  deliveryFee: number;
  serviceFee: number;
  everyHours: number;
  /** Day offsets (from 90d ago) with no collection, to exercise gap detection. */
  holes?: [number, number];
}

const SPECS: Spec[] = [
  { merchant: "Hamburgueria Demo", item: "Combo Clássico", base: 3290, deliveryFee: 599, serviceFee: 99, everyHours: 6, holes: [40, 44] },
  { merchant: "Pizzaria Demo", item: "Pizza Margherita G", base: 5990, deliveryFee: 799, serviceFee: 99, everyHours: 12 },
  { merchant: "Poke Demo", item: "Poke Salmão 500g", base: 4490, deliveryFee: 0, serviceFee: 99, everyHours: 24, holes: [10, 30] },
  { merchant: "Açaiteria Demo", item: "Açaí 500ml", base: 2190, deliveryFee: 499, serviceFee: 0, everyHours: 8 },
];

function generate(spec: Spec, now: Date, seed: number): RawPriceObservation[] {
  const rand = rng(seed);
  const start = now.getTime() - 90 * DAY_MS;
  const out: RawPriceObservation[] = [];
  for (let t = start; t <= now.getTime(); t += spec.everyHours * HOUR_MS) {
    const day = (t - start) / DAY_MS;
    if (spec.holes && day >= spec.holes[0] && day < spec.holes[1]) continue;
    // Jitter the collection time ±1h so cadence is irregular.
    const observedAt = new Date(Math.min(now.getTime(), t + (rand() - 0.5) * 2 * HOUR_MS));
    // Slow drift (+~6% over 90 days) and weekly-ish noise.
    const drift = 1 + 0.06 * (day / 90);
    const noise = 1 + (rand() - 0.5) * 0.08;
    const listPrice = Math.round((spec.base * drift * noise) / 10) * 10;
    const promo = rand() < 0.12;
    const currentPrice = promo ? Math.round((listPrice * 0.8) / 10) * 10 : listPrice;
    const coupon = rand() < 0.05 ? 500 : 0;
    out.push(
      rawPriceObservationSchema.parse({
        observedAt,
        merchant: { name: spec.merchant, platform: "demo" },
        item: { name: spec.item },
        listPrice,
        currentPrice,
        deliveryFee: rand() < 0.15 ? 0 : spec.deliveryFee,
        serviceFee: spec.serviceFee,
        discountValue: coupon,
        promotionType: promo ? "percent_off" : coupon ? "coupon" : undefined,
        deliveryEtaMin: 30 + Math.floor(rand() * 15),
        deliveryEtaMax: 50 + Math.floor(rand() * 15),
        notes: "demo-seed: dado sintético",
      }),
    );
  }
  // Make the most recent price of the first item a clear bargain.
  if (seed === 1 && out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, currentPrice: Math.round(last.listPrice * 0.7), promotionType: "percent_off" };
  }
  return out;
}

async function main() {
  const prisma = db();
  const existing = await prisma.priceObservation.count({ where: { source: "demo-seed" } });
  if (existing > 0) {
    console.log(`Demo data already present (${existing} observations). Nothing to do.`);
    return;
  }
  const now = new Date();
  let total = 0;
  for (const [i, spec] of SPECS.entries()) {
    const r = await ingest(generate(spec, now, i + 1), "demo-seed");
    total += r.inserted;
    console.log(`${spec.item}: ${r.inserted} observations`);
  }

  const first = await prisma.item.findFirstOrThrow({ where: { name: SPECS[0].item } });
  await prisma.alertRule.createMany({
    data: [
      { itemId: first.id, type: "BELOW_MEDIAN_PCT", thresholdPercent: 15, channel: "CONSOLE" },
      { itemId: first.id, type: "NEW_HISTORICAL_LOW", channel: "CONSOLE" },
    ],
  });
  console.log(`Done: ${total} demo observations, 2 alert rules.`);
}

main()
  .then(() => db().$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db().$disconnect();
    process.exit(1);
  });
