import { useEffect, useRef, useState } from "react";
import { useT, type T } from "../i18n";
import { Icon } from "../components/Icon";
import { PriceChart, RadarChart, RangeBar } from "../components/charts";
import { computeSell, isManualPrem, premAuto, premOf } from "../lib/fiscal";
import { arrow, cls, daysTo, displayTicker, eur, fmtDay, fmtTime, gnews, nf, num, pct, px, ratingCls, usd } from "../lib/format";
import { clearPos, setCalc, setPos, ui, useStore, type Tab } from "../lib/store";
import { radarScore, volOf } from "../lib/stats";
import type { Asset, NewsItem, Position } from "../types";

const TABS: Tab[] = ["quote", "anal", "news", "risk", "sell", "ask"];

export function Detail() {
  const t = useT();
  const s = useStore((x) => x);
  const a = s.ui.sel ? s.assets[s.ui.sel] : undefined;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [a?.ticker]);
  if (!a) return <div className="empty"><b>{t("choose")}</b><span>{t("chooseTxt")}</span></div>;
  const sub = a.ticker === "DJI" ? "Dow Jones Industrial Average" : a.ticker === "IBEX" ? "IBEX 35 · BME" : a.kind === "crypto" ? a.ticker + " · crypto" : a.ticker;
  return (
    <div className="detail" ref={scroller}>
      <div className="dhead">
        <button className="icon-btn only-narrow" onClick={() => ui({ open: false })} aria-label={t("back")}><Icon name="back" /></button>
        <div className="row">
          <h2>{a.name}<small>{sub}</small></h2>
          <div className="bigpx">
            {px(a)}
            <span className={"chg " + cls(a.changePct)}>
              {a.change != null ? (a.change > 0 ? "+" : "") + nf(a.change, 2) + "  " : ""}{arrow(a.changePct)}{pct(a.changePct)}{a.kind === "crypto" ? " (24 h)" : ""}
            </span>
          </div>
        </div>
        <div className="stamp">{a.quoteLabel || "—"} · {fmtTime(a.quoteTime)}</div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={s.ui.tab === k} onClick={() => ui({ tab: k })}>{t("tab." + k)}</button>
        ))}
      </div>
      <div className="pane" role="tabpanel">
        {s.ui.tab === "quote" && <PaneQuote a={a} />}
        {s.ui.tab === "anal" && <PaneAnal a={a} />}
        {s.ui.tab === "news" && <PaneNews a={a} />}
        {s.ui.tab === "risk" && <PaneRisk a={a} />}
        {s.ui.tab === "sell" && <PaneSell a={a} />}
        {s.ui.tab === "ask" && <PaneAsk a={a} />}
      </div>
    </div>
  );
}

const Source = ({ a }: { a: Asset }) => {
  const t = useT();
  return <div className="hint">{t("source")}: {a.sourceUrl ? <a href={a.sourceUrl} target="_blank" rel="noopener">{a.sourceName || a.sourceUrl}</a> : a.sourceName || (a.kind === "crypto" ? "CoinGecko" : "Finnhub")}</div>;
};

function PaneQuote({ a }: { a: Asset }) {
  const t = useT();
  const h = useStore((s) => s.hist[a.ticker]);
  const v = volOf(h);
  const score = radarScore(a, h);
  const kv: [string, string][] = [];
  if (a.marketCap) kv.push([t("marketCap"), a.marketCap]);
  if (a.pe != null) kv.push([t("pe"), nf(a.pe, 1)]);
  if (a.change7d != null) kv.push([t("d7"), pct(a.change7d)]);
  if (v) kv.push([t("vol"), nf(v.vol * 100, 1) + "% · " + v.obs + " " + (v.crypto ? "d." : "ses.")]);
  if (a.nextEarnings) { const d = daysTo(a.nextEarnings); kv.push([t("earnings"), fmtDay(a.nextEarnings) + (d != null && d >= 0 ? " · " + t("inDays", { n: d }) : "")]); }
  if (a.consensus) kv.push([t("avgTarget"), nf(a.consensus.avg) + " $"]);
  return (
    <>
      <PriceChart hist={h} fmt={(x) => nf(x, x < 10 ? 4 : 2)} />
      {a.range52 && a.price != null && (
        <div>
          <div className="label">{t("range52")}</div>
          <RangeBar lo={a.range52[0]} hi={a.range52[1]} cur={a.price} labels={{ lo: t("min") + " " + nf(a.range52[0]), hi: t("max") + " " + nf(a.range52[1]) }} />
          <div className="hint">{a.price / a.range52[1] - 1 >= -0.005 ? t("nearHigh") : nf(Math.abs((a.price / a.range52[1] - 1) * 100), 1) + "% " + t("belowHigh")}</div>
        </div>
      )}
      {!!kv.length && <dl className="kv">{kv.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>}
      <div className="scorebox">
        <div>
          <div className="label">{t("score.title")}</div>
          <div className={"scorebig s" + Math.floor((score.total ?? 0) / 20)}>{score.total ?? "N/D"}<small>/100</small></div>
          <p className="hint">{t("score.hint")}</p>
          <details className="mini"><summary>{t("score.how")}</summary><p className="hint">{t("score.method")}</p></details>
        </div>
        <RadarChart axes={score.axes.map((x) => ({ label: t("score." + x.key), value: x.value }))} />
      </div>
      {!!a.growth?.length && (
        <div>
          <div className="label">{t("growth")}</div>
          <dl className="kv">{a.growth.map((g) => <div key={g.label}><dt>{g.label}</dt><dd>{g.value}</dd></div>)}</dl>
        </div>
      )}
      <Source a={a} />
    </>
  );
}

function PaneAnal({ a }: { a: Asset }) {
  const t = useT();
  const c = a.consensus;
  const r = a.reco;
  const recoBar = r && (() => {
    const parts = [["strongBuy", r.strongBuy, "var(--up)"], ["buy", r.buy, "color-mix(in srgb, var(--up) 55%, transparent)"], ["hold", r.hold, "var(--warn)"], ["sell", r.sell, "color-mix(in srgb, var(--down) 55%, transparent)"], ["strongSell", r.strongSell, "var(--down)"]] as const;
    const tot = parts.reduce((s, p) => s + p[1], 0);
    if (!tot) return null;
    return (
      <div>
        <div className="label">{t("liveTrend")} · {fmtDay(r.period)}</div>
        <div className="stack">{parts.map(([k, n, col]) => n > 0 && <span key={k} style={{ flexGrow: n, background: col }} title={t(k) + ": " + n} />)}</div>
        <div className="legend">{parts.map(([k, n, col]) => <span key={k}><i style={{ background: col }} />{t(k)} {n}</span>)}</div>
      </div>
    );
  })();
  if (!c) {
    return (
      <>
        <div className="cons"><span className="pill p-na">{t("noConsensus")}</span></div>
        <p className="hint">{a.consensusNote || t("noConsensusTxt")}</p>
        {recoBar}
        <Source a={a} />
      </>
    );
  }
  const price = a.price ?? c.price ?? 0;
  const up = (c.avg / price - 1) * 100;
  return (
    <>
      <div className="cons">
        <span className={"pill " + ratingCls(c.rating)}>{c.rating}</span>
        <span className="hint">{c.analysts} {t("analysts")}</span>
        <span className={"upside " + cls(up)}>{t("potential")} {pct(up)}</span>
      </div>
      <div>
        <div className="label">{t("target12")}</div>
        <RangeBar lo={c.low} hi={c.high} cur={price} mark={c.avg} labels={{ lo: t("min") + " " + nf(c.low, 0) + " $", hi: t("max") + " " + nf(c.high, 0) + " $", mark: t("avgTarget") }} />
        <div className="legend"><span><i className="ld" />{t("current")} {nf(price)}</span><span><i className="lm" />{t("avgTarget")} {nf(c.avg)}</span></div>
      </div>
      {recoBar}
      {!!a.actions?.length && (
        <div>
          <div className="label">{t("lastActions")}</div>
          <div className="list">
            {a.actions.map((x, i) => {
              const tu = x.target != null ? (x.target / price - 1) * 100 : null;
              return (
                <div className="act" key={i}>
                  <span className="firm">{x.firm}</span>
                  <span className="tg">
                    <span className={"pill " + ratingCls(x.rating)}>{x.rating}</span>
                    <span>{x.target != null ? (x.prev != null ? nf(x.prev, 0) + " → " : "") + nf(x.target, 0) + " $" : t("noTarget")}</span>
                    {tu != null && <small className={cls(tu)}>{pct(tu)}</small>}
                  </span>
                  <span className="who">{x.analyst} · {fmtDay(x.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Source a={a} />
    </>
  );
}

export const ago = (t: T, iso: string) => {
  const d = daysTo(iso);
  if (d == null) return "";
  if (d >= 0) return t("today");
  if (d === -1) return t("yesterday");
  return t("daysAgo", { n: -d });
};

export function NewsRow({ n, tkr }: { n: NewsItem; tkr?: string }) {
  const t = useT();
  return (
    <a className="news" href={n.url || gnews(n.orig || n.title)} target="_blank" rel="noopener">
      <span className="t">{n.title}</span>
      <span className="meta">
        {tkr && <span className="tkr">{tkr}</span>}
        <span className={"cat " + n.cat}>{t("cat." + n.cat)}</span>
        <span>{n.source} · {fmtDay(n.date)} ({ago(t, n.date)})</span>
      </span>
    </a>
  );
}

function PaneNews({ a }: { a: Asset }) {
  const t = useT();
  const ns = (a.news || []).slice().sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      {ns.length ? <div className="list">{ns.map((n, i) => <NewsRow key={i} n={n} />)}</div> : <p className="hint">{t("noNews")}</p>}
      <div className="hint">{t("newsHint")} {a.newsUrl && <a href={a.newsUrl} target="_blank" rel="noopener">{t("allNews")}</a>}</div>
    </>
  );
}

function PaneRisk({ a }: { a: Asset }) {
  const t = useT();
  const rs = a.risks || [];
  return (
    <>
      <p className="hint">{t("riskLegend")}</p>
      {rs.length ? (
        <div className="list">{rs.map((r, i) => <div className="risk" key={i}><span className={"tag " + r.type}>{r.type === "lectura" ? t("reading") : t("fact")}</span><span>{r.text}</span></div>)}</div>
      ) : <p className="hint">{t("noRisks")}</p>}
    </>
  );
}

// ---------- sell calculator ----------
function Field({ id, label, value, onChange, type, ph, wide }: { id: string; label: string; value?: string; onChange: (v: string) => void; type?: string; ph?: string; wide?: boolean }) {
  return (
    <div className={"field" + (wide ? " wide" : "")}>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value ?? ""} type={type || "text"} inputMode={type ? undefined : "decimal"} placeholder={ph} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PaneSell({ a }: { a: Asset }) {
  const t = useT();
  const s = useStore((x) => x);
  if (a.kind === "index") return <p className="hint">{t("indexNoSell")}</p>;
  const tk = a.ticker, pos: Position = s.pos[tk] || {}, st = s.calc, h = s.hist[tk];
  const fx = s.fx?.eurusd;
  const sp = (k: keyof Position) => (v: string) => setPos(tk, { [k]: v });
  const sc = (k: keyof typeof st) => (v: string) => setCalc({ [k]: v });
  const v = volOf(h), au = premAuto(h, st);
  return (
    <>
      <p className="hint">{t("sellIntro")}</p>
      <div>
        <div className="label">{t("yourPos", { name: a.name })}</div>
        <div className="form">
          <Field id="n" label={t("fld.n")} value={pos.n} onChange={sp("n")} ph="30" />
          <Field id="p0" label={t("fld.p0")} value={pos.p0} onChange={sp("p0")} ph={nf(a.price, 2)} />
          <Field id="d0" label={t("fld.d0")} value={pos.d0} onChange={sp("d0")} type="date" />
          <Field id="d1" label={t("fld.d1")} value={pos.d1} onChange={sp("d1")} type="date" />
          <Field id="fx0" label={t("fld.fx0")} value={pos.fx0} onChange={sp("fx0")} ph="1,08" />
          <Field id="cost" label={t("fld.cost")} value={pos.cost} onChange={sp("cost")} ph={t("optional")} />
          <Field id="p1" label={t("fld.p1")} value={pos.p1} onChange={sp("p1")} ph={nf(a.price, 2)} />
          <Field id="fx1" label={t("fld.fx1")} value={pos.fx1} onChange={sp("fx1")} ph={fx ? nf(fx, 4) : ""} />
          <Field id="prem" label={t("fld.prem")} value={pos.prem} onChange={sp("prem")} ph={nf(num(premOf({}, tk, h, st)), 1)} />
          <Field id="above" label={t("fld.above")} value={pos.above} onChange={sp("above")} ph={t("optional")} />
          <Field id="below" label={t("fld.below")} value={pos.below} onChange={sp("below")} ph={t("optional")} />
          <label className="chk"><input type="checkbox" checked={pos.alerts !== false} onChange={(e) => setPos(tk, { alerts: e.target.checked })} /><span>{t("alertsChk")}</span></label>
        </div>
        <p className="hint">
          {v && au != null ? (
            <>
              {isManualPrem(pos) ? t("premManual") : t("premAuto")}
              {t("premFormula", { v: nf(au, 1), k: nf(num(st.k), 2), vol: nf(v.vol * 100, 1), obs: v.obs, unit: v.crypto ? t("days") : t("sessions"), from: fmtDay(v.from), to: fmtDay(v.to) })}
              {v.obs < 120 && <b>{t("shortWindow")}</b>}
            </>
          ) : t("noHist")}
          {isManualPrem(pos) && <button className="btn ghost sm" onClick={() => setPos(tk, { prem: "" })}>{t("backAuto")}</button>}
        </p>
        <p className="hint">{t("costHint")}</p>
      </div>
      <details className="cfg">
        <summary>{t("cfgTitle")}</summary>
        <div className="form">
          {(["bfix", "bpct", "sfix", "spct", "fxfee", "tae", "k", "other"] as const).map((k) => <Field key={k} id={"c-" + k} label={t("fld." + k)} value={st[k]} onChange={sc(k)} />)}
          <label className="chk"><input type="checkbox" checked={st.min2 !== false} onChange={(e) => setCalc({ min2: e.target.checked })} /><span>{t("min2Chk")}</span></label>
        </div>
        <p className="hint">{t("cfgHint")}</p>
      </details>
      <SellResult a={a} />
      {Object.keys(pos).length > 0 && <button className="btn ghost danger" onClick={() => clearPos(tk)}><Icon name="trash" size={16} /> {t("removePos")}</button>}
    </>
  );
}

function SellResult({ a }: { a: Asset }) {
  const t = useT();
  const s = useStore((x) => x);
  const r = computeSell({ ticker: a.ticker, price: a.price, pos: s.pos[a.ticker] || {}, set: s.calc, hist: s.hist[a.ticker], fxLive: s.fx?.eurusd });
  if (r.missing) return <div className="verdict"><span className="state">{t("missing")}</span><span className="hint">{t("fillIn", { f: r.missing.map((m) => t("miss." + m)).join(", ") })}</span></div>;
  const hasNow = r.Psell > 0, ok = hasNow && r.Psell >= r.pHur;
  const distNow = hasNow ? (r.pHur / r.Psell - 1) * 100 : NaN;
  const who = (r.userPrice ? t("userAt", { p: usd(r.Psell) }) : t("nowAt", { p: usd(r.Psell) }));
  return (
    <>
      <div className={"verdict " + (hasNow ? (ok ? "ok" : "ko") : "")}>
        <span className="label">{t("minPrice", { tae: nf(r.tae * 100, 2), prem: nf(r.prem * 100, 1) })}</span>
        <span className="big">{usd(r.pHur)}<small>{pct((r.pHur / r.P0 - 1) * 100)} {t("overBuy")}</small></span>
        {hasNow && <span className="state">{who}{ok ? t("alreadyOver", { m: pct(-distNow).replace("+", "") }) : t("stillShort", { m: pct(distNow) })}</span>}
        <span className="hint">{t("depOnly", { a: usd(r.pDep), b: pct((r.pDep / r.P0 - 1) * 100), c: usd(r.pBE), d: pct((r.pBE / r.P0 - 1) * 100) })}</span>
        <span className="hint">{t("margRate", { r: nf(r.margRate * 100, 0) })}{r.min2 ? t("min2Fixed") : "."}</span>
        <span className="hint">{t("resultPre", { a: pct(r.lossPct * 100), b: pct(r.redThr * 100) })}</span>
      </div>
      {r.now && (
        <div>
          <div className="label">{t("ifSell", { p: usd(r.Psell), fx: nf(r.fx1, 4) })}</div>
          <table className="tbl"><tbody>
            <tr><td>{t("saleAmount")}</td><td>{eur(r.now.g)}</td></tr>
            <tr><td>{t("fees")}</td><td>−{eur(r.now.fees)}</td></tr>
            <tr><td>{t("acqCost")} {r.costOverride ? t("yours") : t("withFees")}</td><td>{eur(r.cost)}</td></tr>
            <tr><td>{r.now.gain >= 0 ? t("gain") : t("loss")}</td><td className={cls(r.now.gain)}>{eur(r.now.gain)}</td></tr>
            <tr><td>{r.now.tax >= 0 ? t("taxDue") : t("taxSave")}</td><td>{r.now.tax >= 0 ? "−" : "+"}{eur(Math.abs(r.now.tax))}</td></tr>
            <tr className="tot"><td>{t("net")}</td><td>{eur(r.now.net)}</td></tr>
            <tr><td>{t("withDep", { r: nf(r.tae * 100, 2), m: nf(r.years * 12, 1) })}</td><td>{eur(r.dep)}</td></tr>
            <tr><td>{t("withHurdle", { r: nf((r.tae + r.prem) * 100, 2) })}</td><td>{eur(r.hurdle)}</td></tr>
            <tr className="tot"><td>{r.now.net - r.hurdle >= 0 ? t("over") : t("under")}</td><td className={cls(r.now.net - r.hurdle)}>{r.now.net - r.hurdle >= 0 ? "+" : ""}{eur(r.now.net - r.hurdle)}</td></tr>
          </tbody></table>
        </div>
      )}
      <div>
        <div className="label">{t("fxSens")}</div>
        <table className="tbl"><tbody>
          {r.sens.map((x, i) => (
            <tr key={i}><td>EUR/USD {nf(x.fx, 4)}{i === 0 ? t("usdStrong") : i === 2 ? t("usdWeak") : t("usdNow")}</td><td>{usd(x.p)} ({pct((x.p / r.P0 - 1) * 100)})</td></tr>
          ))}
        </tbody></table>
        <p className="hint">{t("fxSensHint")}</p>
      </div>
      <ul className="notes">{["ret", "fees", "fifo", "loss", "dep", "approx"].map((k) => <li key={k}>{t("note." + k)}</li>)}</ul>
    </>
  );
}

// ---------- ask Claude ----------
function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
  const out: React.ReactNode[] = [];
  let ul: React.ReactNode[] | null = null;
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { ul = null; return; }
    if (/^#{1,4}\s/.test(line)) { ul = null; out.push(<h4 key={i}>{inline(line.replace(/^#{1,4}\s/, ""))}</h4>); }
    else if (/^[-*•]\s/.test(line)) { if (!ul) { ul = []; out.push(<ul key={i}>{ul}</ul>); } ul.push(<li key={i}>{inline(line.replace(/^[-*•]\s/, ""))}</li>); }
    else { ul = null; out.push(<p key={i}>{inline(line)}</p>); }
  });
  return <>{out}</>;
}

const answers: Record<string, string> = {};

function PaneAsk({ a }: { a: Asset }) {
  const t = useT();
  const s = useStore((x) => x);
  const [text, setText] = useState(answers[a.ticker] || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setText(answers[a.ticker] || ""); setErr(""); }, [a.ticker]);
  if (!s.settings.anthropicKey) {
    return (
      <div className="empty">
        <Icon name="spark" size={28} />
        <span>{t("askNoKey")}</span>
        <button className="btn" onClick={() => ui({ view: "settings", open: false })}>{t("goSettings")}</button>
      </div>
    );
  }
  const run = async (question: string) => {
    ctl.current = new AbortController();
    setBusy(true); setErr(""); setText(t("thinking"));
    const sc = radarScore(a, s.hist[a.ticker]);
    // the SDK is loaded on first use so it stays out of the startup bundle
    const { askClaude, aiErrorCode } = await import("../lib/ai");
    try {
      const res = await askClaude(a, { radarScore: sc, eurusd: s.fx?.eurusd }, question, {
        key: s.settings.anthropicKey, model: s.settings.aiModel, lang: s.settings.lang, signal: ctl.current.signal, onText: setText,
      });
      answers[a.ticker] = res.text;
      if (res.refused) setErr(t("err.refused"));
      else if (res.truncated) setErr(t("truncated"));
    } catch (e) {
      const c = aiErrorCode(e);
      if (c !== "cancelled") setErr(t("err." + c) === "err." + c ? t("err.unknown") : t("err." + c));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="hint">{t("askIntro")}</p>
      <div className="presets">
        {[1, 2, 3].map((i) => <button key={i} disabled={busy} onClick={() => run(t(`preset.${i}q`))}>{t(`preset.${i}`)}</button>)}
      </div>
      <div className="askrow">
        <textarea rows={2} placeholder={t("askPh")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("tab.ask")} />
        {busy ? <button className="btn ghost" onClick={() => ctl.current?.abort()}>{t("stop")}</button> : <button className="btn" disabled={!q.trim()} onClick={() => run(q.trim())}>{t("send")}</button>}
      </div>
      {text && <div className="answer"><Md text={text} /></div>}
      {err && <p className="hint warn">{err}</p>}
      <p className="hint">Claude · {s.settings.aiModel} · {displayTicker(a.ticker)}</p>
    </>
  );
}
