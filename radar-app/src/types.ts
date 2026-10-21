export type Kind = "stock" | "index" | "crypto";
export type NewsCat = "reg" | "legal" | "prod" | "contr" | "corp" | "anal" | "vendes" | "merc";

export interface Consensus {
  rating: string;
  analysts: number;
  avg: number;
  low: number;
  high: number;
  price?: number;
  priceTime?: string;
}

export interface AnalystAction {
  firm: string;
  analyst: string;
  date: string;
  rating: string;
  target: number | null;
  prev: number | null;
}

export interface NewsItem {
  title: string;
  orig?: string;
  source: string;
  date: string;
  cat: NewsCat | string;
  url?: string;
}

export interface Risk {
  type: "fet" | "lectura";
  text: string;
}

export interface Asset {
  ticker: string;
  name: string;
  kind: Kind;
  order?: number;
  price: number | null;
  change: number | null;
  changePct: number | null;
  change7d?: number | null;
  quoteTime?: string | null;
  quoteLabel?: string;
  range52?: [number, number] | null;
  marketCap?: string | null;
  pe?: number | null;
  nextEarnings?: string | null;
  consensus?: Consensus | null;
  consensusNote?: string | null;
  growth?: { label: string; value: string }[];
  actions?: AnalystAction[];
  news?: NewsItem[];
  risks?: Risk[];
  newsUrl?: string;
  sourceUrl?: string;
  sourceName?: string;
  /** CoinGecko id for crypto live quotes */
  cgId?: string;
  /** Finnhub recommendation trend (live) */
  reco?: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; period: string } | null;
  hidden?: boolean;
  custom?: boolean;
}

export interface Hist {
  ann: number;
  closes: { d: string; c: number }[];
}

export interface PickArg {
  type: "fet" | "lectura" | "previsio";
  text: string;
  source: string;
  url?: string;
}

export interface Pick {
  ticker: string;
  name: string;
  banks: { bank: string; list: string; date: string; note?: string; url?: string }[];
  consensus?: Consensus;
  args?: PickArg[];
  contra?: PickArg[];
}

export interface Picks {
  asOf: string;
  method: string;
  caveat: string;
  picks: Pick[];
  runnersUp?: { name: string; note: string; ticker: string }[];
}

export interface Meta {
  updatedAt: string;
  note?: string;
  sources?: { name: string; url: string }[];
}

export interface Position {
  n?: string;
  p0?: string;
  d0?: string;
  d1?: string;
  fx0?: string;
  fx1?: string;
  cost?: string;
  p1?: string;
  prem?: string;
  alerts?: boolean;
  /** user-defined price alerts in asset currency */
  above?: string;
  below?: string;
}

export interface CalcSettings {
  bfix: string;
  bpct: string;
  sfix: string;
  spct: string;
  fxfee: string;
  tae: string;
  prem: string;
  k: string;
  other: string;
  min2: boolean;
  fxnow: string;
}

export type Lang = "ca" | "es" | "en";
export type Theme = "auto" | "light" | "dark";

export interface AppSettings {
  lang: Lang;
  theme: Theme;
  finnhubKey: string;
  anthropicKey: string;
  aiModel: string;
  autoRefresh: boolean;
  notify: boolean;
}
