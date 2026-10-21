import { useSyncExternalStore } from "react";
import seed from "../data/seed.json";
import type { AppSettings, Asset, CalcSettings, Hist, Meta, Picks, Position } from "../types";
import { DEF_SET } from "./fiscal";
import { CG_IDS, fetchCrypto, fetchCryptoHist, fetchEurUsd, fetchStock } from "./providers";
import { mergeClose } from "./stats";

export type Tab = "quote" | "anal" | "news" | "risk" | "sell" | "ask";
export type View = "radar" | "portfolio" | "news" | "settings";

export interface State {
  assets: Record<string, Asset>;
  hist: Record<string, Hist>;
  picks: Picks | null;
  meta: Meta | null;
  fx: { eurusd: number; asOf: string; source: string } | null;
  pos: Record<string, Position>;
  calc: CalcSettings;
  settings: AppSettings;
  ui: { sel: string | null; tab: Tab; view: View; filter: "all" | "stock" | "index" | "crypto"; newsCat: string; onboarded: boolean; open: boolean };
  refresh: { at: string | null; busy: boolean; errors: string[] };
}

const KEY = "radar-app-v1";
const S = seed as unknown as { assets: Record<string, Asset>; hist: Record<string, Hist>; picks: Picks; meta: Meta; fx: State["fx"] };

const DEF_SETTINGS: AppSettings = { lang: "ca", theme: "auto", finnhubKey: "", anthropicKey: "", aiModel: "claude-opus-5-5", autoRefresh: true, notify: false };

function initial(): State {
  const base: State = {
    assets: Object.fromEntries(Object.entries(S.assets).map(([k, a]) => [k, { ...a, cgId: a.kind === "crypto" ? CG_IDS[k] : undefined }])),
    hist: S.hist,
    picks: S.picks,
    meta: S.meta,
    fx: S.fx,
    pos: {},
    calc: { ...DEF_SET },
    settings: { ...DEF_SETTINGS, lang: guessLang() },
    ui: { sel: "AAPL", tab: "quote", view: "radar", filter: "all", newsCat: "all", onboarded: false, open: false },
    refresh: { at: null, busy: false, errors: [] },
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<State>;
    return {
      ...base,
      ...s,
      assets: { ...base.assets, ...(s.assets || {}) },
      hist: { ...base.hist, ...(s.hist || {}) },
      calc: { ...DEF_SET, ...(s.calc || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
      ui: { ...base.ui, ...(s.ui || {}) },
      refresh: { ...base.refresh, ...(s.refresh || {}), busy: false, errors: [] },
    };
  } catch {
    return base;
  }
}

function guessLang(): AppSettings["lang"] {
  const l = (typeof navigator !== "undefined" && navigator.language) || "ca";
  return l.startsWith("es") ? "es" : l.startsWith("en") ? "en" : "ca";
}

let state: State = initial();
const subs = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const getState = () => state;
export function setState(fn: (s: State) => Partial<State>) {
  state = { ...state, ...fn(state) };
  subs.forEach((f) => f());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked: app keeps working in memory */ }
  }, 300);
}
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

// ---------- actions ----------
export const ui = (patch: Partial<State["ui"]>) => setState((s) => ({ ui: { ...s.ui, ...patch } }));
export const setSettings = (patch: Partial<AppSettings>) => setState((s) => ({ settings: { ...s.settings, ...patch } }));
export const setCalc = (patch: Partial<CalcSettings>) => setState((s) => ({ calc: { ...s.calc, ...patch } }));
export const setPos = (t: string, patch: Partial<Position>) => setState((s) => ({ pos: { ...s.pos, [t]: { ...(s.pos[t] || {}), ...patch } } }));
export const clearPos = (t: string) => setState((s) => { const pos = { ...s.pos }; delete pos[t]; return { pos }; });

export const visibleAssets = (s: State) => Object.values(s.assets).filter((a) => !a.hidden).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export function addAsset(a: Pick<Asset, "ticker" | "name" | "kind"> & { cgId?: string }) {
  setState((s) => {
    const maxOrder = Math.max(0, ...Object.values(s.assets).map((x) => x.order ?? 0));
    const prev = s.assets[a.ticker];
    return {
      assets: {
        ...s.assets,
        [a.ticker]: prev ? { ...prev, hidden: false } : { ...a, order: maxOrder + 1, price: null, change: null, changePct: null, news: [], risks: [], actions: [], growth: [], custom: true },
      },
      ui: { ...s.ui, sel: a.ticker, tab: "quote", open: true, view: "radar" },
    };
  });
  void refreshAll();
}
export const hideAsset = (t: string) => setState((s) => ({ assets: { ...s.assets, [t]: { ...s.assets[t], hidden: true } } }));
export const restoreAsset = (t: string) => setState((s) => ({ assets: { ...s.assets, [t]: { ...s.assets[t], hidden: false } } }));

/** Refresh everything we can reach; keeps snapshot values for whatever fails. */
export async function refreshAll(): Promise<string[]> {
  if (state.refresh.busy) return [];
  setState((s) => ({ refresh: { ...s.refresh, busy: true, errors: [] } }));
  const errors: string[] = [];
  const list = visibleAssets(state);

  const fxP = fetchEurUsd().then((v) => setState(() => ({ fx: { eurusd: v, asOf: new Date().toISOString(), source: "BCE (Frankfurter)" } }))).catch(() => errors.push("fx"));

  const cryptos = list.filter((a) => a.kind === "crypto");
  const cryptoP = fetchCrypto(cryptos)
    .then(async (res) => {
      const d = new Date().toISOString().slice(0, 10);
      setState((s) => {
        const assets = { ...s.assets }, hist = { ...s.hist };
        for (const [t, patch] of Object.entries(res)) {
          assets[t] = { ...assets[t], ...patch };
          if (patch.price) hist[t] = mergeClose(hist[t], d, patch.price, 365);
        }
        return { assets, hist };
      });
      // backfill a year of daily history for coins that still have little
      for (const a of cryptos) {
        const id = a.cgId || CG_IDS[a.ticker];
        if (id && (state.hist[a.ticker]?.closes.length ?? 0) < 120) {
          try {
            const h = await fetchCryptoHist(id);
            setState((s) => ({ hist: { ...s.hist, [a.ticker]: h } }));
          } catch { /* rate limited: the next refresh will try again */ }
        }
      }
    })
    .catch(() => errors.push("crypto"));

  const key = state.settings.finnhubKey.trim();
  const stocks = list.filter((a) => a.kind === "stock");
  const stockP = key
    ? Promise.all(
        stocks.map((a) =>
          fetchStock(a.ticker, key)
            .then(({ patch, close }) =>
              setState((s) => ({
                assets: { ...s.assets, [a.ticker]: { ...s.assets[a.ticker], ...patch, news: patch.news ?? s.assets[a.ticker].news } },
                hist: close ? { ...s.hist, [a.ticker]: mergeClose(s.hist[a.ticker], close.d, close.c, 252) } : s.hist,
              }))
            )
            .catch((e: Error) => errors.push(a.ticker + ":" + e.message))
        )
      )
    : Promise.resolve(errors.push("nokey"));

  await Promise.allSettled([fxP, cryptoP, stockP]);
  // only stamp a refresh time if at least one live source answered
  const anyOk = !errors.includes("fx") || !errors.includes("crypto") || (key && errors.length < stocks.length + 2);
  setState((s) => ({ refresh: { at: anyOk ? new Date().toISOString() : s.refresh.at, busy: false, errors } }));
  return errors;
}

export function exportBackup(): string {
  const { pos, calc, settings, assets } = state;
  const custom = Object.fromEntries(Object.entries(assets).filter(([, a]) => a.custom || a.hidden).map(([k, a]) => [k, { ticker: a.ticker, name: a.name, kind: a.kind, cgId: a.cgId, hidden: a.hidden, custom: a.custom, order: a.order }]));
  return JSON.stringify({ app: "radar-valors", v: 1, at: new Date().toISOString(), pos, calc, settings: { ...settings, anthropicKey: "", finnhubKey: "" }, custom }, null, 2);
}

export function importBackup(text: string) {
  const j = JSON.parse(text);
  if (j.app !== "radar-valors") throw new Error("format");
  setState((s) => {
    const assets = { ...s.assets };
    for (const [k, a] of Object.entries<Asset>(j.custom || {})) assets[k] = { ...(assets[k] || { price: null, change: null, changePct: null }), ...a };
    return { pos: j.pos || {}, calc: { ...DEF_SET, ...(j.calc || {}) }, settings: { ...s.settings, ...j.settings, anthropicKey: s.settings.anthropicKey, finnhubKey: s.settings.finnhubKey }, assets };
  });
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = initial();
  subs.forEach((f) => f());
}
