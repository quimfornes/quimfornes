import type { Asset } from "../types";
import { alertOf, computeSell } from "./fiscal";
import { num } from "./format";
import type { State } from "./store";

export const assetAlert = (s: State, a: Asset) =>
  a.kind === "index" ? null : alertOf({ ticker: a.ticker, price: a.price, pos: s.pos[a.ticker] || {}, set: s.calc, hist: s.hist[a.ticker], fxLive: s.fx?.eurusd });

export const owned = (s: State, t: string) => num(s.pos[t]?.n) > 0;

export function portfolio(s: State) {
  const rows = Object.values(s.assets)
    .filter((a) => owned(s, a.ticker) && a.kind !== "index")
    .map((a) => {
      const r = computeSell({ ticker: a.ticker, price: a.price, pos: s.pos[a.ticker], set: s.calc, hist: s.hist[a.ticker], fxLive: s.fx?.eurusd, live: true });
      return { a, r: r.missing ? null : r, alert: assetAlert(s, a) };
    });
  const ok = rows.filter((x) => x.r && x.r.now);
  const value = ok.reduce((t, x) => t + x.r!.now!.proceeds, 0);
  const cost = ok.reduce((t, x) => t + x.r!.cost, 0);
  const net = ok.reduce((t, x) => t + x.r!.now!.net, 0);
  return { rows, value, cost, net, pl: value - cost };
}
