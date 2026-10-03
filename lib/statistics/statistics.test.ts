import { describe, expect, it } from "vitest";
import {
  max,
  mean,
  median,
  min,
  p10,
  p25,
  p50,
  p75,
  p90,
  percentile,
  percentileRank,
  priceChangePercentage,
  rollingMedian,
  standardDeviation,
  zScore,
} from "./index";

/**
 * Deterministic fixture: 10 prices in cents.
 * Expected values cross-checked with numpy 2.x:
 *   np.median, np.mean, np.std(ddof=1), np.percentile(method="linear").
 */
const PRICES = [3690, 3190, 3990, 3590, 3690, 4290, 2990, 3690, 3890, 3490];
const CTX = { window: "30d", lastUpdatedAt: "2026-10-01T12:00:00.000Z", unit: "cents" as const };

describe("median", () => {
  it("even n averages the two middle values", () => {
    const r = median(PRICES, CTX);
    expect(r.value).toBe(3690);
    expect(r.explanation.variables).toEqual({ n: 10, lowerMiddle: 3690, upperMiddle: 3690 });
    expect(r.explanation.sampleSize).toBe(10);
    expect(r.explanation.window).toBe("30d");
    expect(r.explanation.lastUpdatedAt).toBe("2026-10-01T12:00:00.000Z");
    expect(r.explanation.unit).toBe("cents");
  });

  it("odd n picks the middle value", () => {
    const r = median([5, 1, 3]);
    expect(r.value).toBe(3);
    expect(r.explanation.variables).toMatchObject({ position: 2, middle: 3 });
  });

  it("even n with distinct middles", () => {
    expect(median([1, 2, 3, 4]).value).toBe(2.5);
  });

  it("empty sample is null, not zero", () => {
    const r = median([]);
    expect(r.value).toBeNull();
    expect(r.explanation.notes?.[0]).toMatch(/Sem observações/);
  });

  it("does not mutate input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("flags small samples", () => {
    expect(median([1, 2, 3]).explanation.notes?.[0]).toMatch(/Amostra pequena/);
    expect(median(PRICES).explanation.notes).toEqual([]);
  });
});

describe("mean", () => {
  it("computes arithmetic mean", () => {
    const r = mean(PRICES);
    expect(r.value).toBe(3650);
    expect(r.explanation.variables).toEqual({ sum: 36500, n: 10 });
  });
  it("empty → null", () => expect(mean([]).value).toBeNull());
  it("rejects NaN", () => expect(() => mean([1, NaN])).toThrow(TypeError));
});

describe("standardDeviation", () => {
  it("uses sample (n − 1) definition", () => {
    expect(standardDeviation(PRICES).value).toBeCloseTo(374.7591819348052, 10);
  });
  it("n = 1 → null with note", () => {
    const r = standardDeviation([42]);
    expect(r.value).toBeNull();
    expect(r.explanation.notes?.join(" ")).toMatch(/indefinido/);
  });
  it("constant sample → 0", () => expect(standardDeviation([5, 5, 5]).value).toBe(0));
});

describe("min / max", () => {
  it("finds extremes", () => {
    expect(min(PRICES).value).toBe(2990);
    expect(max(PRICES).value).toBe(4290);
  });
  it("empty → null", () => {
    expect(min([]).value).toBeNull();
    expect(max([]).value).toBeNull();
  });
});

describe("percentile (type 7 linear)", () => {
  it.each([
    [p10, 3170],
    [p25, 3515],
    [p50, 3690],
    [p75, 3840],
    [p90, 4020],
  ])("%o matches numpy", (fn, expected) => {
    expect(fn(PRICES).value).toBeCloseTo(expected, 10);
  });

  it("exposes interpolation inputs", () => {
    // sorted: 2990 3190 3490 3590 3690 3690 3690 3890 3990 4290
    // h = 9 × 0.25 = 2.25 → 3490 + 0.25 × (3590 − 3490) = 3515
    const r = percentile(PRICES, 25);
    expect(r.explanation.variables).toEqual({
      n: 10,
      p: 0.25,
      h: 2.25,
      lowerValue: 3490,
      upperValue: 3590,
    });
  });

  it("P0 and P100 are min and max", () => {
    expect(percentile(PRICES, 0).value).toBe(2990);
    expect(percentile(PRICES, 100).value).toBe(4290);
  });

  it("single observation", () => expect(p90([7]).value).toBe(7));
  it("empty → null", () => expect(p50([]).value).toBeNull());
  it("rejects out-of-range k", () => expect(() => percentile(PRICES, 101)).toThrow(RangeError));
});

describe("percentileRank (mid-rank)", () => {
  it("value below all observations → 0", () => {
    expect(percentileRank(1000, PRICES).value).toBe(0);
  });
  it("value above all observations → 100", () => {
    expect(percentileRank(9999, PRICES).value).toBe(100);
  });
  it("splits ties evenly", () => {
    // below 3690: 2990 3190 3490 3590 = 4; equal: 3
    const r = percentileRank(3690, PRICES);
    expect(r.value).toBeCloseTo(((4 + 1.5) / 10) * 100, 10);
    expect(r.explanation.variables).toEqual({ x: 3690, below: 4, equal: 3, n: 10 });
  });
  it("cheapest member of the sample", () => {
    expect(percentileRank(2990, PRICES).value).toBe(5);
  });
  it("empty → null", () => expect(percentileRank(1, []).value).toBeNull());
});

describe("zScore", () => {
  it("matches numpy reference", () => {
    const r = zScore(3190, PRICES);
    expect(r.value).toBeCloseTo(-1.2274549155143146, 10);
    expect(r.explanation.variables.mean).toBe(3650);
    expect(r.explanation.unit).toBe("zscore");
  });
  it("constant sample → null", () => {
    const r = zScore(5, [5, 5, 5]);
    expect(r.value).toBeNull();
    expect(r.explanation.notes?.join(" ")).toMatch(/desvio padrão 0/);
  });
});

describe("priceChangePercentage", () => {
  it("reproduces the spec example", () => {
    const r = priceChangePercentage(3190, 3690, {
      name: "Difference from median",
      referenceLabel: "median",
      sampleSize: 84,
      window: "30d",
    });
    expect(r.value).toBeCloseTo(-13.5501355, 6);
    expect(r.explanation).toMatchObject({
      name: "Difference from median",
      formula: "(current − median) / median × 100",
      variables: { current: 3190, median: 3690 },
      sampleSize: 84,
      window: "30d",
    });
  });
  it("zero reference → null", () => {
    expect(priceChangePercentage(10, 0).value).toBeNull();
  });
});

describe("rollingMedian (time-based, trailing)", () => {
  const H = 3_600_000;
  const points = [
    { t: 0 * H, value: 100 },
    { t: 1 * H, value: 300 },
    { t: 2 * H, value: 200 },
    { t: 5 * H, value: 1000 },
    { t: 5 * H, value: 0 },
  ];

  it("uses (t − window, t] and groups equal timestamps", () => {
    const r = rollingMedian(points, 2 * H, { windowLabel: "2h" });
    expect(r.value).toEqual([
      { t: 0, median: 100, count: 1 },
      { t: 1 * H, median: 200, count: 2 }, // {100,300}
      { t: 2 * H, median: 250, count: 2 }, // {300,200}; t=0 excluded (boundary open)
      { t: 5 * H, median: 500, count: 2 }, // {1000,0}
      { t: 5 * H, median: 500, count: 2 },
    ]);
    expect(r.explanation.variables.rollingWindow).toBe("2h");
  });

  it("accepts unsorted input", () => {
    const r = rollingMedian([...points].reverse(), 2 * H);
    expect(r.value.map((p) => p.t)).toEqual([0, H, 2 * H, 5 * H, 5 * H]);
  });

  it("rejects non-positive window", () => {
    expect(() => rollingMedian(points, 0)).toThrow(RangeError);
  });
});
