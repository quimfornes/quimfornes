import type { Asset, Lang } from "../types";

const LOCALE: Record<Lang, string> = { ca: "ca-ES", es: "es-ES", en: "en-GB" };
let locale = "ca-ES";
export const setLocale = (l: Lang) => { locale = LOCALE[l]; };

export const nf = (v: number | null | undefined, d = 2) =>
  v == null || isNaN(v) ? "N/D" : Number(v).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });

export const px = (a: Pick<Asset, "price" | "kind">) =>
  a.price == null ? "N/D" : a.kind === "index" ? nf(a.price, 2) : (a.price < 10 ? nf(a.price, 4) : nf(a.price, 2)) + " $";

export const pct = (v: number | null | undefined) => (v == null || isNaN(v) ? "N/D" : (v > 0 ? "+" : "") + nf(v, 2) + "%");
export const cls = (v: number | null | undefined) => (v == null || isNaN(v) ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat");
export const arrow = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "▲ " : v < 0 ? "▼ " : "");
export const eur = (v: number) => (isNaN(v) ? "N/D" : nf(v, 2) + " €");
export const usd = (v: number) => (isNaN(v) ? "N/D" : nf(v, v < 10 ? 4 : 2) + " $");

export const fmtTime = (iso?: string | null) => {
  if (!iso) return "N/D";
  return new Date(iso).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
};
export const fmtDay = (iso?: string | null) => {
  if (!iso) return "";
  return new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "short" });
};
export const daysTo = (iso?: string | null) => {
  if (!iso) return null;
  return Math.round((new Date(iso.slice(0, 10) + "T12:00:00Z").getTime() - Date.now()) / 86400000);
};

/** Parses user-typed numbers in Catalan/Spanish ("1.234,5") or dotted ("1.08") form. */
export const num = (v: unknown, decimalDot = false): number => {
  if (v == null) return NaN;
  let s = String(v).trim().replace(/\s/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!decimalDot && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
};

export const ratingCls = (r?: string) => {
  const s = (r || "").toLowerCase();
  if (/compra|buy|comprar/.test(s)) return "p-buy";
  if (/manten|hold|neutral/.test(s)) return "p-hold";
  if (/vend|sell/.test(s)) return "p-sell";
  return "p-na";
};

export const gnews = (q: string) => "https://news.google.com/search?q=" + encodeURIComponent(q) + "&hl=ca&gl=ES&ceid=ES:ca";
export const displayTicker = (t: string) => (t === "DJI" ? "DOW" : t);
