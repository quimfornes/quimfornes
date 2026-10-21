import type { Asset, Hist } from "../types";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const sortedCloses = (h?: Hist) =>
  !h || !Array.isArray(h.closes) ? [] : h.closes.filter((x) => x && x.c > 0).sort((a, b) => a.d.localeCompare(b.d));

export function volOf(h?: Hist) {
  const cs = sortedCloses(h).slice(-253);
  if (cs.length < 16) return null;
  const r: number[] = [];
  for (let i = 1; i < cs.length; i++) r.push(Math.log(cs[i].c / cs[i - 1].c));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - m) * (b - m), 0) / (r.length - 1);
  const ann = h!.ann || 252;
  return { vol: Math.sqrt(v * ann), obs: r.length, from: cs[0].d, to: cs[cs.length - 1].d, crypto: ann === 365 };
}

/** Return over roughly the last quarter (63 sessions, or as much history as there is). */
export function perfOf(h?: Hist) {
  const cs = sortedCloses(h);
  if (cs.length < 16) return null;
  const last = cs[cs.length - 1];
  const first = cs[Math.max(0, cs.length - 1 - 63)];
  return { pct: (last.c / first.c - 1) * 100, from: first.d, to: last.d };
}

const RATING_SCORE: [RegExp, number][] = [
  [/venda forta|venta fuerte|strong sell/i, 10],
  [/compra forta|compra fuerte|strong buy/i, 90],
  [/compra|buy/i, 75],
  [/manten|hold|neutral/i, 50],
  [/vend|sell/i, 25],
];

export function consensusScore(a: Asset): number | null {
  const r = a.reco;
  if (r) {
    const tot = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
    if (tot > 0) return clamp((((5 * r.strongBuy + 4 * r.buy + 3 * r.hold + 2 * r.sell + r.strongSell) / tot) - 1) * 25);
  }
  const txt = a.consensus?.rating;
  if (!txt) return null;
  for (const [re, s] of RATING_SCORE) if (re.test(txt)) return s;
  return null;
}

export interface RadarScore {
  axes: { key: "consensus" | "upside" | "momentum" | "stability" | "trend"; value: number | null }[];
  total: number | null;
}

/**
 * Five 0–100 axes, all derived from data on screen so the user can audit them:
 * - consensus: analyst rating (Finnhub trend if live, else consensus label)
 * - upside: +20% to the mean target maps to 100, −20% to 0
 * - momentum: quarter return, ±33% maps to the ends
 * - stability: 15% annual volatility = 100, ~82% = 0
 * - trend: price vs 20-session average, ±10% maps to the ends
 */
export function radarScore(a: Asset, h?: Hist): RadarScore {
  const cs = sortedCloses(h);
  const price = a.price ?? cs[cs.length - 1]?.c;
  const up = a.consensus?.avg && price ? (a.consensus.avg / price - 1) * 100 : null;
  const pf = perfOf(h);
  const v = volOf(h);
  let trend: number | null = null;
  if (cs.length >= 20 && price) {
    const sma = cs.slice(-20).reduce((s, x) => s + x.c, 0) / 20;
    trend = clamp(50 + (price / sma - 1) * 500);
  }
  const axes: RadarScore["axes"] = [
    { key: "consensus", value: consensusScore(a) },
    { key: "upside", value: up == null ? null : clamp(50 + up * 2.5) },
    { key: "momentum", value: pf ? clamp(50 + pf.pct * 1.5) : null },
    { key: "stability", value: v ? clamp(100 - (v.vol * 100 - 15) * 1.5) : null },
    { key: "trend", value: trend },
  ];
  const vals = axes.map((x) => x.value).filter((x): x is number => x != null);
  return { axes, total: vals.length >= 3 ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null };
}

/** Appends today's close to a history, replacing a same-day entry. */
export function mergeClose(h: Hist | undefined, d: string, c: number, ann: number): Hist {
  const closes = (h?.closes || []).filter((x) => x.d !== d);
  closes.push({ d, c });
  closes.sort((a, b) => a.d.localeCompare(b.d));
  return { ann: h?.ann || ann, closes: closes.slice(-400) };
}
