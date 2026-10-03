import { describe, expect, it } from "vitest";
import { analyzePrices, classify, type ObservationPoint } from "./analysis";
import { evaluateAlert, type AlertRuleInput } from "./alerts";
import { assessDataQuality } from "./data-quality";
import { effectivePrice } from "./effective-price";
import { formatBRL, parseBRLToCents } from "./money";
import { DAY_MS, HOUR_MS } from "./windows";

const NOW = new Date("2026-10-01T12:00:00.000Z");

/** One observation per day for `days` days ending at NOW, deterministic prices. */
function dailySeries(prices: number[]): ObservationPoint[] {
  return prices.map((p, i) => ({
    id: `obs-${i}`,
    observedAt: new Date(NOW.getTime() - (prices.length - 1 - i) * DAY_MS),
    effectivePrice: p,
  }));
}

// History of 20 prices + current (last). Sorted history: 3290..4240 step 50.
const HISTORY = Array.from({ length: 20 }, (_, i) => 3290 + ((i * 7) % 20) * 50);

describe("effectivePrice", () => {
  it("adds fees and subtracts discounts", () => {
    const r = effectivePrice({ currentPrice: 2990, deliveryFee: 599, serviceFee: 99, discountValue: 1000 });
    expect(r.value).toBe(2688);
    expect(r.explanation.variables).toMatchObject({ currentPrice: 2990, discountValue: 1000 });
  });
  it("ignores unrelated fields of a full observation", () => {
    const obs = { observedAt: new Date(), listPrice: 3000, currentPrice: 3000, deliveryFee: 0, serviceFee: 0, discountValue: 0 };
    const r = effectivePrice(obs);
    expect(r.value).toBe(3000);
    expect(Object.keys(r.explanation.variables)).toEqual(["currentPrice", "deliveryFee", "serviceFee", "discountValue"]);
  });
  it("floors at zero", () => {
    const r = effectivePrice({ currentPrice: 500, deliveryFee: 0, serviceFee: 0, discountValue: 900 });
    expect(r.value).toBe(0);
    expect(r.explanation.notes?.length).toBe(1);
  });
  it("rejects non-integer cents", () => {
    expect(() =>
      effectivePrice({ currentPrice: 29.9, deliveryFee: 0, serviceFee: 0, discountValue: 0 }),
    ).toThrow(RangeError);
  });
});

describe("money", () => {
  it("formats cents as BRL", () => {
    expect(formatBRL(2790)).toBe("R$ 27,90");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
  });
  it.each([
    ["27,90", 2790],
    ["27.90", 2790],
    ["R$ 1.234,56", 123456],
    ["27", 2700],
    ["0,5", 50],
    ["abc", null],
    ["-1", null],
    ["", null],
  ])("parses %s", (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });
});

describe("analyzePrices", () => {
  it("compares the latest price against prior observations only", () => {
    const series = dailySeries([...HISTORY, 2990]);
    const a = analyzePrices(series, "30d", NOW);
    expect(a.current?.effectivePrice).toBe(2990);
    expect(a.historySize).toBe(20);
    // Median of 3290..4240 step 50 (20 values) = (3740 + 3790) / 2
    expect(a.median.value).toBe(3765);
    expect(a.percentileRank.value).toBe(0);
    expect(a.isNewLow.value).toBe(true);
    expect(a.label.value).toBe("low");
    expect(a.diffFromMedian.value).toBeCloseTo(((2990 - 3765) / 3765) * 100, 10);
    expect(a.diffFromMedian.explanation.variables).toEqual({ current: 2990, median: 3765 });
    expect(a.median.explanation.window).toBe("30d");
    expect(a.median.explanation.sampleSize).toBe(20);
  });

  it("respects the window boundary", () => {
    const series = dailySeries([...HISTORY, 2990]);
    const a = analyzePrices(series, "7d", NOW);
    // (NOW − 7d, NOW] contains days 0..6 back → 7 observations, 6 history.
    expect(a.historySize).toBe(6);
    expect(a.label.value).toBe("insufficient");
  });

  it("handles an empty window", () => {
    const a = analyzePrices([], "30d", NOW);
    expect(a.current).toBeNull();
    expect(a.median.value).toBeNull();
    expect(a.percentileRank.value).toBeNull();
    expect(a.label.value).toBe("insufficient");
  });

  it("ignores future observations", () => {
    const future = { observedAt: new Date(NOW.getTime() + HOUR_MS), effectivePrice: 1 };
    const a = analyzePrices([...dailySeries(HISTORY), future], "30d", NOW);
    expect(a.current?.effectivePrice).not.toBe(1);
  });
});

describe("classify", () => {
  it.each([
    [10, 20, "low"],
    [25, 20, "low"],
    [50, 20, "near"],
    [75, 20, "high"],
    [5, 9, "insufficient"],
    [null, 50, "insufficient"],
  ] as const)("rank %s with n=%s → %s", (rank, n, label) => {
    expect(classify(rank, n).value).toBe(label);
  });
});

describe("evaluateAlert", () => {
  const analysis = analyzePrices(dailySeries([...HISTORY, 2990]), "30d", NOW);
  const rule = (r: Partial<AlertRuleInput>): AlertRuleInput => ({
    type: "ABSOLUTE_PRICE",
    minSampleSize: 10,
    cooldownMinutes: 60,
    active: true,
    ...r,
  });

  it("absolute threshold", () => {
    expect(evaluateAlert(rule({ thresholdCents: 3000 }), analysis, NOW).value).toBe(true);
    expect(evaluateAlert(rule({ thresholdCents: 2989 }), analysis, NOW).value).toBe(false);
  });

  it("percentile threshold", () => {
    expect(evaluateAlert(rule({ type: "PERCENTILE", thresholdPercent: 10 }), analysis, NOW).value).toBe(true);
  });

  it("below median percentage", () => {
    // diff ≈ −20.58%
    expect(evaluateAlert(rule({ type: "BELOW_MEDIAN_PCT", thresholdPercent: 20 }), analysis, NOW).value).toBe(true);
    expect(evaluateAlert(rule({ type: "BELOW_MEDIAN_PCT", thresholdPercent: 21 }), analysis, NOW).value).toBe(false);
  });

  it("new historical low", () => {
    expect(evaluateAlert(rule({ type: "NEW_HISTORICAL_LOW" }), analysis, NOW).value).toBe(true);
  });

  it("blocks statistical rules on small samples", () => {
    const d = evaluateAlert(rule({ type: "NEW_HISTORICAL_LOW", minSampleSize: 50 }), analysis, NOW);
    expect(d.value).toBe(false);
    expect(d.blockedBy).toBe("sample");
  });

  it("respects cooldown", () => {
    const d = evaluateAlert(
      rule({ thresholdCents: 5000, lastTriggeredAt: new Date(NOW.getTime() - 30 * 60_000) }),
      analysis,
      NOW,
    );
    expect(d.blockedBy).toBe("cooldown");
  });

  it("inactive rules never fire", () => {
    expect(evaluateAlert(rule({ thresholdCents: 99999, active: false }), analysis, NOW).value).toBe(false);
  });
});

describe("assessDataQuality", () => {
  const start = new Date(NOW.getTime() - 10 * DAY_MS);

  it("hourly collection with one 2-day hole", () => {
    const ts: Date[] = [];
    for (let h = 0; h <= 240; h++) {
      const t = start.getTime() + h * HOUR_MS;
      const day = Math.floor(h / 24);
      if (day === 4 || day === 5) continue;
      ts.push(new Date(t));
    }
    const r = assessDataQuality(ts, start, NOW, "10d");
    expect(r.medianIntervalMs.value).toBe(HOUR_MS);
    expect(r.gaps.value).toHaveLength(1);
    expect(r.gaps.value[0].durationMs).toBe(49 * HOUR_MS);
    // Days 0–3 and 6–9 have data; h=240 (= end) belongs to day 9 → 8 of 10.
    expect(r.dayCoverage.value).toBe(80);
    expect(r.quality.value).toBe("good");
  });

  it("no data", () => {
    const r = assessDataQuality([], start, NOW);
    expect(r.quality.value).toBe("none");
    expect(r.gaps.value).toHaveLength(1);
    expect(r.dayCoverage.value).toBeNull();
  });
});

describe("format", async () => {
  const { formatValue, formatDuration, formatSignedPercent } = await import("./format");
  it("formats by unit", () => {
    expect(formatValue(3690, "cents")).toBe("R$ 36,90");
    expect(formatValue(-13.5501, "percent")).toBe("-13,6%");
    expect(formatValue(84, "count")).toBe("84");
    expect(formatValue(-1.2275, "zscore")).toBe("-1,23");
    expect(formatValue(null, "cents")).toBe("—");
  });
  it("formats durations", () => {
    expect(formatDuration(30 * 60_000)).toBe("30 min");
    expect(formatDuration(HOUR_MS)).toBe("1 h");
    expect(formatDuration(26 * HOUR_MS)).toBe("1 d 2 h");
  });
  it("signs percentages with a real minus", () => {
    expect(formatSignedPercent(-13.55)).toBe("−13,6%");
    expect(formatSignedPercent(4.2)).toBe("+4,2%");
  });
});

describe("buildHistoryChart", async () => {
  const { buildHistoryChart } = await import("./chart");
  it("aligns rolling medians with points and exposes reference lines", () => {
    const obs = dailySeries([...HISTORY, 2990]).map((o, i) => ({
      ...o,
      promotionType: i === HISTORY.length ? "percent_off" : null,
    }));
    const a = analyzePrices(obs, "30d", NOW);
    const c = buildHistoryChart(a, obs, "30d", NOW);
    expect(c.points).toHaveLength(21);
    expect(c.points.at(-1)).toMatchObject({ price: 2990, promotion: true });
    expect(c.reference).toEqual({
      median: a.median.value,
      p25: a.p25.value,
      p75: a.p75.value,
      min: 3290,
      max: 4240,
    });
    expect(c.legend.band.variables.iqr).toBe((a.p75.value ?? 0) - (a.p25.value ?? 0));
    expect(c.legend.rolling.variables.rollingWindow).toBe("3d");
  });
});
