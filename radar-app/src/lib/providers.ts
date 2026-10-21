import type { Asset, Hist, NewsItem } from "../types";

/**
 * Live data adapters. All three services answer CORS requests from a browser, so the
 * app works without a backend:
 * - CoinGecko (crypto, no key)
 * - Frankfurter / ECB (EUR/USD, no key)
 * - Finnhub (stocks: quote, 52w range, P/E, analyst trend, news, earnings date; free key)
 * Indices (Dow Jones, IBEX 35) are not on Finnhub's free plan: they keep the last snapshot.
 */

export const CG_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", XRP: "ripple", SOL: "solana", ADA: "cardano", DOGE: "dogecoin" };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function getJSON<T>(url: string, timeoutMs = 12000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 429) throw new Error("rate_limited");
    if (r.status === 401 || r.status === 403) throw new Error("bad_key");
    if (!r.ok) throw new Error("http_" + r.status);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ---------- FX ----------
export async function fetchEurUsd(): Promise<number> {
  for (const u of ["https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", "https://api.frankfurter.app/latest?from=EUR&to=USD"]) {
    try {
      const j = await getJSON<{ rates: { USD: number } }>(u);
      if (j.rates?.USD > 0) return j.rates.USD;
    } catch { /* try next mirror */ }
  }
  throw new Error("fx_unavailable");
}

// ---------- Crypto ----------
export async function fetchCrypto(assets: Asset[]): Promise<Record<string, Partial<Asset>>> {
  const ids = assets.map((a) => a.cgId || CG_IDS[a.ticker]).filter(Boolean);
  if (!ids.length) return {};
  const j = await getJSON<Record<string, { usd: number; usd_24h_change?: number; usd_market_cap?: number }>>(
    "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true"
  );
  const out: Record<string, Partial<Asset>> = {};
  for (const a of assets) {
    const q = j[a.cgId || CG_IDS[a.ticker]];
    if (!q) continue;
    const pctCh = q.usd_24h_change ?? null;
    out[a.ticker] = {
      price: q.usd,
      changePct: pctCh,
      change: pctCh != null ? q.usd - q.usd / (1 + pctCh / 100) : null,
      quoteTime: new Date().toISOString(),
      quoteLabel: "CoinGecko · directe",
      marketCap: q.usd_market_cap ? fmtCap(q.usd_market_cap) : undefined,
    };
  }
  return out;
}

export async function fetchCryptoHist(cgId: string): Promise<Hist> {
  const j = await getJSON<{ prices: [number, number][] }>(`https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=365&interval=daily`, 20000);
  const byDay = new Map<string, number>();
  for (const [ts, c] of j.prices) byDay.set(new Date(ts).toISOString().slice(0, 10), c);
  return { ann: 365, closes: [...byDay].map(([d, c]) => ({ d, c })) };
}

export async function searchCrypto(q: string) {
  const j = await getJSON<{ coins: { id: string; symbol: string; name: string; market_cap_rank: number | null }[] }>(
    "https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(q)
  );
  return j.coins.slice(0, 8).map((c) => ({ ticker: c.symbol.toUpperCase(), name: c.name, cgId: c.id, kind: "crypto" as const }));
}

// ---------- Stocks (Finnhub) ----------
const FH = "https://finnhub.io/api/v1";

export async function fetchStock(t: string, key: string): Promise<{ patch: Partial<Asset>; close?: { d: string; c: number } }> {
  const k = "&token=" + encodeURIComponent(key);
  const [q, m, rec, news, earn] = await Promise.allSettled([
    getJSON<{ c: number; d: number; dp: number; t: number; pc: number }>(`${FH}/quote?symbol=${t}${k}`),
    getJSON<{ metric: Record<string, number> }>(`${FH}/stock/metric?symbol=${t}&metric=all${k}`),
    getJSON<{ strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; period: string }[]>(`${FH}/stock/recommendation?symbol=${t}${k}`),
    getJSON<{ headline: string; source: string; datetime: number; url: string; summary: string }[]>(`${FH}/company-news?symbol=${t}&from=${daysAgo(7)}&to=${today()}${k}`),
    getJSON<{ earningsCalendar: { date: string }[] }>(`${FH}/calendar/earnings?symbol=${t}&from=${today()}&to=${daysAgo(-120)}${k}`),
  ]);
  if (q.status === "rejected") throw q.reason;
  const quote = q.value;
  if (!quote || !(quote.c > 0)) throw new Error("no_quote");
  const patch: Partial<Asset> = {
    price: quote.c,
    change: quote.d,
    changePct: quote.dp,
    quoteTime: new Date(quote.t * 1000).toISOString(),
    quoteLabel: "Finnhub · últim preu",
  };
  if (m.status === "fulfilled" && m.value?.metric) {
    const mt = m.value.metric;
    if (mt["52WeekLow"] > 0 && mt["52WeekHigh"] > 0) patch.range52 = [mt["52WeekLow"], mt["52WeekHigh"]];
    const pe = mt.peTTM ?? mt.peBasicExclExtraTTM;
    if (pe) patch.pe = pe;
    if (mt.marketCapitalization) patch.marketCap = fmtCap(mt.marketCapitalization * 1e6);
  }
  if (rec.status === "fulfilled" && rec.value?.length) patch.reco = rec.value[0];
  if (news.status === "fulfilled" && news.value?.length) {
    patch.news = news.value.slice(0, 12).map<NewsItem>((n) => ({
      title: n.headline,
      orig: n.headline,
      source: n.source,
      date: new Date(n.datetime * 1000).toISOString().slice(0, 10),
      cat: categorize(n.headline + " " + n.summary),
      url: n.url,
    }));
  }
  if (earn.status === "fulfilled") {
    const next = earn.value?.earningsCalendar?.map((e) => e.date).filter((d) => d >= today()).sort()[0];
    if (next) patch.nextEarnings = next;
  }
  return { patch, close: { d: new Date(quote.t * 1000).toISOString().slice(0, 10), c: quote.c } };
}

export async function searchStock(q: string, key: string) {
  const j = await getJSON<{ result: { symbol: string; description: string; type: string }[] }>(`${FH}/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(key)}`);
  return j.result
    .filter((r) => /common stock|etp|etf|adr/i.test(r.type) && !r.symbol.includes("."))
    .slice(0, 8)
    .map((r) => ({ ticker: r.symbol, name: titleCase(r.description), kind: "stock" as const }));
}

// ---------- helpers ----------
const RULES: [string, RegExp][] = [
  ["legal", /lawsuit|court|sue[ds]?|antitrust|probe|settle|fine[ds]?|judge|litigation/i],
  ["reg", /regulat|sec |ftc|cftc|tariff|export control|ban|policy|congress|eu commission/i],
  ["anal", /upgrade|downgrade|price target|analyst|rating|overweight|underweight|outperform/i],
  ["contr", /contract|deal|partnership|agreement|award|order/i],
  ["corp", /ceo|acquir|merger|buyback|dividend|layoff|executive|board|spin.?off|earnings|results|quarter/i],
  ["prod", /launch|unveil|product|chip|model|release|event|device|iphone|ai /i],
  ["vendes", /sales|revenue|demand|shipments|deliveries/i],
];
export const categorize = (s: string) => RULES.find(([, re]) => re.test(s))?.[0] ?? "merc";

const fmtCap = (v: number) => (v >= 1e12 ? (v / 1e12).toFixed(2).replace(".", ",") + " bilions $" : (v / 1e9).toFixed(1).replace(".", ",") + " mil M$");
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
