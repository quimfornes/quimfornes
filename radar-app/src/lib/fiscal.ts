import type { CalcSettings, Hist, Position } from "../types";
import { num } from "./format";
import { volOf } from "./stats";

/** Spanish savings-income brackets (base del estalvi), 2026. */
export const BRACKETS: [number, number][] = [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [Infinity, 0.30]];

export const taxOn = (x: number) => {
  x = Math.max(0, x);
  let t = 0, prev = 0;
  for (const [lim, r] of BRACKETS) {
    if (x > prev) t += (Math.min(x, lim) - prev) * r;
    prev = lim;
  }
  return t;
};

export const DEF_SET: CalcSettings = { bfix: "0", bpct: "0,10", sfix: "0", spct: "0,10", fxfee: "0,25", tae: "3,00", prem: "4", k: "0,15", other: "0", min2: true, fxnow: "" };
export const DEF_PREM: Record<string, string> = { AAPL: "4", MSFT: "4", AMZN: "4", NVDA: "5", AVGO: "5", PLTR: "7", BTC: "10", ETH: "12", BNB: "12", XRP: "12" };

export const isManualPrem = (p: Position) => p.prem != null && String(p.prem).trim() !== "";
export const premAuto = (h: Hist | undefined, st: CalcSettings) => {
  const v = volOf(h);
  if (!v) return null;
  const k = num(st.k);
  if (!(k >= 0)) return null;
  return Math.round(k * v.vol * 100 * 2) / 2;
};
export const premOf = (p: Position, t: string, h: Hist | undefined, st: CalcSettings): string | number =>
  isManualPrem(p) ? p.prem! : premAuto(h, st) ?? DEF_PREM[t] ?? st.prem;

export interface SellInput {
  ticker: string;
  price: number | null;
  pos: Position;
  set: CalcSettings;
  hist?: Hist;
  fxLive?: number | null;
  /** live: ignore user's hypothetical sale price/date/fx (used for alerts) */
  live?: boolean;
  now?: Date;
}

export type SellResult =
  | { missing: string[] }
  | {
      missing?: undefined;
      N: number; P0: number; fx1: number; cost: number; years: number;
      dep: number; hurdle: number; pDep: number; pHur: number; pBE: number;
      now: { g: number; fees: number; proceeds: number; gain: number; tax: number; net: number } | null;
      Psell: number; userPrice: boolean;
      sens: { fx: number; p: number }[];
      tae: number; prem: number; min2: boolean; margRate: number; costOverride: boolean;
      lossPct: number; redThr: number; green: boolean; red: boolean;
    };

export function computeSell({ ticker, price, pos: p, set: st, hist, fxLive, live = false, now: today = new Date() }: SellInput): SellResult {
  const N = num(p.n), P0 = num(p.p0), fx0 = num(p.fx0, true), costOverride = num(p.cost);
  const fxL = fxLive || num(st.fxnow, true) || NaN;
  const fx1 = live ? fxL : num(p.fx1, true) || num(st.fxnow, true) || fxL;
  const bfix = num(st.bfix) || 0, bpct = (num(st.bpct) || 0) / 100, sfix = num(st.sfix) || 0, spct = (num(st.spct) || 0) / 100;
  const fxfee = (num(st.fxfee) || 0) / 100, tae = (num(st.tae) || 0) / 100;
  const prem = (num(premOf(p, ticker, hist, st)) || 0) / 100;
  const otherIn = Math.max(0, num(st.other) || 0), other = st.min2 !== false ? Math.max(otherIn, 6000) : otherIn;

  const missing: string[] = [];
  if (!(N > 0)) missing.push("n");
  if (!(P0 > 0)) missing.push("p0");
  if (!p.d0) missing.push("d0");
  if (!(costOverride > 0) && !(fx0 > 0)) missing.push("fx0");
  if (!(fx1 > 0)) missing.push("fx1");
  if (missing.length) return { missing };

  const cost = costOverride > 0 ? costOverride : (N * P0 / fx0) * (1 + fxfee + bpct) + bfix;
  const dSale = !live && p.d1 ? new Date(p.d1 + "T12:00:00Z") : today;
  const pUser = num(p.p1);
  const userPrice = !live && pUser > 0;
  const Psell = userPrice ? pUser : price ?? NaN;
  const years = Math.max(0, (dSale.getTime() - new Date(p.d0 + "T12:00:00Z").getTime()) / (365.25 * 86400000));

  const sell = (P1: number, fx = fx1) => {
    const g = N * P1 / fx, fees = g * (fxfee + spct) + sfix, proceeds = g - fees, gain = proceeds - cost;
    const tax = taxOn(other + gain) - taxOn(other);
    return { g, fees, proceeds, gain, tax, net: proceeds - tax };
  };
  const alt = (rate: number) => { const i = cost * (Math.pow(1 + rate, years) - 1); return cost + i - (taxOn(other + i) - taxOn(other)); };
  const dep = alt(tae), hurdle = alt(tae + prem);
  const solve = (target: number, fx = fx1) => {
    let lo = 0, hi = Math.max(P0, price || 0) * 50;
    for (let i = 0; i < 120; i++) { const m = (lo + hi) / 2; if (sell(m, fx).net >= target) hi = m; else lo = m; }
    return hi;
  };
  const nowRes = Psell > 0 ? sell(Psell) : null;
  const margRate = (() => { for (const [lim, r] of BRACKETS) if (other < lim) return r; return 0.30; })();
  const lossPct = nowRes ? nowRes.proceeds / cost - 1 : NaN;
  const redThr = -0.05 * Math.max(years, 1);
  return {
    N, P0, fx1, cost, years, dep, hurdle,
    pDep: solve(dep), pHur: solve(hurdle), pBE: solve(cost),
    now: nowRes, Psell, userPrice,
    sens: [fx1 / 1.05, fx1, fx1 * 1.05].map((fx) => ({ fx, p: solve(hurdle, fx) })),
    tae, prem, min2: st.min2 !== false, margRate, costOverride: costOverride > 0,
    lossPct, redThr,
    green: nowRes ? nowRes.net >= hurdle : false,
    red: nowRes ? lossPct <= redThr : false,
  };
}

export type AlertKind = "green" | "red" | "above" | "below" | null;

export function alertOf(input: Omit<SellInput, "live">): AlertKind {
  const p = input.pos;
  if (!p || !(input.price! > 0)) return null;
  const above = num(p.above), below = num(p.below);
  if (above > 0 && input.price! >= above) return "above";
  if (below > 0 && input.price! <= below) return "below";
  if (p.alerts === false) return null;
  const r = computeSell({ ...input, live: true });
  if (r.missing) return null;
  return r.red ? "red" : r.green ? "green" : null;
}
