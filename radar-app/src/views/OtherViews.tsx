import { useRef, useState } from "react";
import { useT } from "../i18n";
import { Donut } from "../components/charts";
import { Icon } from "../components/Icon";
import { AI_MODELS } from "../lib/models";
import { portfolio } from "../lib/derived";
import { cls, displayTicker, eur, fmtTime, pct, usd } from "../lib/format";
import { searchCrypto, searchStock } from "../lib/providers";
import { addAsset, exportBackup, hideAsset, importBackup, resetAll, restoreAsset, setSettings, ui, useStore, visibleAssets } from "../lib/store";
import { NewsRow } from "./Detail";
import { open } from "./RadarView";
import type { Kind, Lang, Theme } from "../types";

const PALETTE = ["#3b5bdb", "#0ca678", "#f59f00", "#e64980", "#7048e8", "#1098ad", "#d9480f", "#5c940d", "#c2255c", "#495057"];

export function PortfolioView() {
  const t = useT();
  const s = useStore((x) => x);
  const p = portfolio(s);
  if (!p.rows.length) {
    return (
      <section className="card empty">
        <Icon name="wallet" size={32} />
        <b>{t("pfEmpty")}</b>
        <span>{t("pfEmptyTxt")}</span>
      </section>
    );
  }
  const plPct = p.cost > 0 ? (p.pl / p.cost) * 100 : NaN;
  const parts = p.rows.filter((x) => x.r?.now).map((x, i) => ({ label: x.a.ticker, value: x.r!.now!.proceeds, color: PALETTE[i % PALETTE.length] }));
  const alerts = p.rows.filter((x) => x.alert);
  return (
    <>
      <section className="card hero">
        <div className="label">{t("pfValue")}</div>
        <div className="herobig">{eur(p.value)}</div>
        <div className={"chg " + cls(p.pl)}>{p.pl >= 0 ? "+" : ""}{eur(p.pl)} · {pct(plPct)}</div>
        <dl className="kv">
          <div><dt>{t("pfCost")}</dt><dd>{eur(p.cost)}</dd></div>
          <div><dt>{t("pfNet")}</dt><dd>{eur(p.net)}</dd></div>
        </dl>
      </section>
      <section className="card pad">
        <div className="label">{t("pfAlloc")}</div>
        <div className="alloc">
          <Donut parts={parts} />
          <ul className="legend col">
            {parts.map((x) => <li key={x.label}><i style={{ background: x.color }} />{displayTicker(x.label)} · {pct((x.value / p.value) * 100).replace("+", "")}</li>)}
          </ul>
        </div>
      </section>
      <section className="card pad">
        <div className="label">{t("pfAlerts")}</div>
        {alerts.length ? (
          <div className="list">{alerts.map((x) => (
            <button key={x.a.ticker} className={"alertrow al-" + x.alert} onClick={() => { ui({ view: "radar" }); open(x.a.ticker, "sell"); }}>
              <b>{displayTicker(x.a.ticker)}</b><span>{t("badge." + x.alert)}</span>
            </button>
          ))}</div>
        ) : <p className="hint">{t("pfNoAlerts")}</p>}
      </section>
      <section className="card">
        <div className="list pos">
          {p.rows.map(({ a, r }) => {
            const ch = r?.now ? (r.now.proceeds / r.cost - 1) * 100 : NaN;
            return (
              <button key={a.ticker} className="posrow" onClick={() => { ui({ view: "radar" }); open(a.ticker, "sell"); }}>
                <span className="sym"><b>{displayTicker(a.ticker)}</b><small>{s.pos[a.ticker]?.n} {t("units")} · {usd(Number(a.price))}</small></span>
                <span className="v">{r?.now ? eur(r.now.proceeds) : "N/D"}<small className={cls(ch)}>{pct(ch)}</small></span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

const CATS = ["all", "reg", "legal", "prod", "contr", "corp", "anal", "vendes", "merc"];

export function NewsView() {
  const t = useT();
  const s = useStore((x) => x);
  const [more, setMore] = useState(false);
  const seen = new Map<string, { n: import("../types").NewsItem; tkr: string }>();
  for (const a of visibleAssets(s)) for (const n of a.news || []) {
    const k = n.orig || n.title;
    const e = seen.get(k);
    if (e) e.tkr += " · " + displayTicker(a.ticker); else seen.set(k, { n, tkr: displayTicker(a.ticker) });
  }
  const items = [...seen.values()].sort((x, y) => y.n.date.localeCompare(x.n.date));
  const present = CATS.filter((c) => c === "all" || items.some((x) => x.n.cat === c));
  const shown = items.filter((x) => s.ui.newsCat === "all" || x.n.cat === s.ui.newsCat);
  const cap = more ? shown.length : 15;
  return (
    <section className="card pad">
      <div className="section-h"><h3>{t("newsTitle")}</h3><span className="hint">{t("newsSub")}</span></div>
      <nav className="seg scroll">{present.map((c) => <button key={c} className="chip" aria-pressed={s.ui.newsCat === c} onClick={() => { ui({ newsCat: c }); setMore(false); }}>{t("cat." + c)}</button>)}</nav>
      {shown.length ? <div className="list">{shown.slice(0, cap).map((x, i) => <NewsRow key={i} n={x.n} tkr={x.tkr} />)}</div> : <p className="hint">{t("noCatNews")}</p>}
      {shown.length > cap && <button className="btn ghost" onClick={() => setMore(true)}>{t("showMore", { n: shown.length - cap })}</button>}
    </section>
  );
}

export function SettingsView() {
  const t = useT();
  const s = useStore((x) => x);
  const st = s.settings;
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ ticker: string; name: string; kind: Kind; cgId?: string }[]>([]);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const hidden = Object.values(s.assets).filter((a) => a.hidden);

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setMsg("");
    const [st1, cr] = await Promise.allSettled([st.finnhubKey ? searchStock(term, st.finnhubKey) : Promise.resolve([]), searchCrypto(term)]);
    const out = [...(st1.status === "fulfilled" ? st1.value : []), ...(cr.status === "fulfilled" ? cr.value : [])];
    setRes(out.filter((x) => !s.assets[x.ticker] || s.assets[x.ticker].hidden));
    if (!st.finnhubKey) setMsg(t("searchStockNeedsKey"));
  };

  const askNotify = async (on: boolean) => {
    if (!on) return setSettings({ notify: false });
    if (!("Notification" in window)) return setMsg(t("notifyDenied"));
    const p = await Notification.requestPermission();
    if (p === "granted") setSettings({ notify: true }); else setMsg(t("notifyDenied"));
  };

  const doExport = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement("a");
    aEl.href = url; aEl.download = "radar-valors-" + new Date().toISOString().slice(0, 10) + ".json"; aEl.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try { importBackup(await f.text()); setMsg(t("importOk")); } catch { setMsg(t("importErr")); }
  };

  return (
    <>
      <section className="card pad form1">
        <h3>{t("setTitle")}</h3>
        <div className="field"><label>{t("language")}</label>
          <div className="seg">{(["ca", "es", "en"] as Lang[]).map((l) => <button key={l} className="chip" aria-pressed={st.lang === l} onClick={() => setSettings({ lang: l })}>{{ ca: "Català", es: "Castellano", en: "English" }[l]}</button>)}</div>
        </div>
        <div className="field"><label>{t("theme")}</label>
          <div className="seg">{(["auto", "light", "dark"] as Theme[]).map((x) => <button key={x} className="chip" aria-pressed={st.theme === x} onClick={() => setSettings({ theme: x })}>{t("theme." + x)}</button>)}</div>
        </div>
        <label className="chk"><input type="checkbox" checked={st.autoRefresh} onChange={(e) => setSettings({ autoRefresh: e.target.checked })} /><span>{t("autoRefresh")}</span></label>
        <label className="chk"><input type="checkbox" checked={st.notify} onChange={(e) => askNotify(e.target.checked)} /><span>{t("notify")}</span></label>
      </section>

      <section className="card pad form1">
        <h3>{t("watchlist")}</h3>
        <div className="list">
          {visibleAssets(s).map((a) => (
            <div className="wlrow" key={a.ticker}>
              <span><b>{displayTicker(a.ticker)}</b> <small className="hint">{a.name}</small></span>
              <button className="btn ghost sm" onClick={() => hideAsset(a.ticker)}>{t("remove")}</button>
            </div>
          ))}
        </div>
        <div className="field"><label htmlFor="srch">{t("addAsset")}</label>
          <div className="askrow">
            <input id="srch" value={q} placeholder={t("searchPh")} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button className="btn" onClick={search} aria-label={t("addAsset")}><Icon name="plus" size={18} /></button>
          </div>
        </div>
        {!!res.length && (
          <div className="list">
            {res.map((r) => (
              <div className="wlrow" key={r.kind + r.ticker}>
                <span><b>{r.ticker}</b> <small className="hint">{r.name} · {t("f." + r.kind)}</small></span>
                <button className="btn sm" onClick={() => { addAsset(r); setRes([]); setQ(""); }}>{t("addToRadar")}</button>
              </div>
            ))}
          </div>
        )}
        {!!hidden.length && (
          <div><div className="label">{t("hiddenAssets")}</div>
            <div className="seg">{hidden.map((a) => <button key={a.ticker} className="chip" onClick={() => restoreAsset(a.ticker)}>{t("restore")} {displayTicker(a.ticker)}</button>)}</div>
          </div>
        )}
      </section>

      <section className="card pad form1">
        <h3>{t("dataSrc")}</h3>
        <div className="field"><label htmlFor="fh">{t("finnhubKey")}</label>
          <input id="fh" type="password" autoComplete="off" value={st.finnhubKey} onChange={(e) => setSettings({ finnhubKey: e.target.value.trim() })} />
          <span className="hint">{t("finnhubHint")} <a href="https://finnhub.io/register" target="_blank" rel="noopener">finnhub.io</a></span>
        </div>
        <h3>{t("aiTitle")}</h3>
        <div className="field"><label htmlFor="ak">{t("anthropicKey")}</label>
          <input id="ak" type="password" autoComplete="off" value={st.anthropicKey} onChange={(e) => setSettings({ anthropicKey: e.target.value.trim() })} />
          <span className="hint">{t("anthropicHint")}</span>
        </div>
        <div className="field"><label>{t("aiModel")}</label>
          <div className="seg">{AI_MODELS.map((m) => <button key={m.id} className="chip" aria-pressed={st.aiModel === m.id} onClick={() => setSettings({ aiModel: m.id })}>{m.label}</button>)}</div>
        </div>
      </section>

      <section className="card pad form1">
        <h3>{t("backup")}</h3>
        <div className="row-btns">
          <button className="btn ghost" onClick={doExport}>{t("exportBtn")}</button>
          <button className="btn ghost" onClick={() => file.current?.click()}>{t("importBtn")}</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
          <button className="btn ghost danger" onClick={() => confirm(t("resetConfirm")) && resetAll()}>{t("reset")}</button>
        </div>
        {msg && <p className="hint warn">{msg}</p>}
      </section>

      <section className="card pad form1">
        <h3>{t("install")}</h3>
        <p className="hint">{t("installIOS")}</p>
        <p className="hint">{t("installMac")}</p>
      </section>

      <section className="card pad form1">
        <h3>{t("about")}</h3>
        <p className="hint">{t("disclaimer")}</p>
        {s.meta?.sources && (
          <>
            <div className="label">{t("sources")}</div>
            <ul className="notes">
              {s.meta.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener">{x.name}</a></li>)}
              <li>Live: CoinGecko · Finnhub · BCE (Frankfurter)</li>
            </ul>
          </>
        )}
        <p className="hint">{t("snapshot")}: {fmtTime(s.meta?.updatedAt)} · v1.0.0</p>
      </section>
    </>
  );
}
