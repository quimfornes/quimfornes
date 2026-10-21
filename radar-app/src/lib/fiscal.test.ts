import { describe, expect, it } from "vitest";
import { alertOf, computeSell, DEF_SET, taxOn } from "./fiscal";
import { num } from "./format";
import { consensusScore, radarScore } from "./stats";
import type { Asset } from "../types";

describe("taxOn (savings brackets)", () => {
  it("applies 19% up to 6,000 € and 21% above", () => {
    expect(taxOn(6000)).toBeCloseTo(1140);
    expect(taxOn(10000)).toBeCloseTo(1140 + 840);
    expect(taxOn(-50)).toBe(0);
  });
});

describe("num", () => {
  it("parses Catalan and dotted numbers", () => {
    expect(num("1.234,5")).toBe(1234.5);
    expect(num("1.234")).toBe(1234);
    expect(num("1.08", true)).toBe(1.08);
    expect(num("")).toBeNaN();
  });
});

describe("computeSell", () => {
  const base = { ticker: "AAPL", set: { ...DEF_SET }, fxLive: 1.1, now: new Date("2026-10-20T12:00:00Z") };
  it("reports missing fields", () => {
    const r = computeSell({ ...base, price: 300, pos: {} });
    expect(r.missing).toEqual(["n", "p0", "d0", "fx0"]);
  });
  it("needs a higher sale price than purchase to beat a deposit plus premium", () => {
    const r = computeSell({ ...base, price: 300, pos: { n: "10", p0: "200", d0: "2025-10-20", fx0: "1,10", prem: "4" } });
    if (r.missing) throw new Error("unexpected");
    expect(r.years).toBeCloseTo(1, 2);
    expect(r.pBE).toBeGreaterThan(200);
    expect(r.pDep).toBeGreaterThan(r.pBE);
    expect(r.pHur).toBeGreaterThan(r.pDep);
    // at 300 $ the position clears the hurdle comfortably
    expect(r.now!.net).toBeGreaterThan(r.hurdle);
    expect(r.green).toBe(true);
  });
  it("flags red when the loss exceeds 5% a year", () => {
    const pos = { n: "10", p0: "200", d0: "2025-10-20", fx0: "1,10" };
    expect(alertOf({ ...base, price: 150, pos })).toBe("red");
    expect(alertOf({ ...base, price: 150, pos: { ...pos, alerts: false } })).toBe(null);
    expect(alertOf({ ...base, price: 150, pos: { ...pos, below: "160" } })).toBe("below");
  });
});

describe("radar score", () => {
  const a = { ticker: "X", name: "X", kind: "stock", price: 100, change: 0, changePct: 0, consensus: { rating: "Compra forta", analysts: 10, avg: 120, low: 90, high: 150 } } as Asset;
  it("maps ratings without confusing strong sell with strong buy", () => {
    expect(consensusScore(a)).toBe(90);
    expect(consensusScore({ ...a, consensus: { ...a.consensus!, rating: "Venda forta" } })).toBe(10);
  });
  it("needs three axes for a total", () => {
    expect(radarScore(a).total).toBeNull();
    const closes = Array.from({ length: 70 }, (_, i) => ({ d: "2026-0" + (1 + Math.floor(i / 28)) + "-" + String(1 + (i % 28)).padStart(2, "0"), c: 80 + i * 0.3 }));
    const s = radarScore(a, { ann: 252, closes });
    expect(s.total).not.toBeNull();
    expect(s.axes.find((x) => x.key === "upside")!.value).toBe(100);
  });
});
