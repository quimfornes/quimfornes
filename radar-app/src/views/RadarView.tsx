import { useState } from "react";
import { useT } from "../i18n";
import { Sparkline, RangeBar } from "../components/charts";
import { arrow, cls, displayTicker, fmtDay, nf, num, pct, px, ratingCls, usd } from "../lib/format";
import { addAsset, ui, useStore, visibleAssets, type State } from "../lib/store";
import { assetAlert } from "../lib/derived";
import { radarScore } from "../lib/stats";
import type { Asset, PickArg } from "../types";

const FILTERS = ["all", "stock", "index", "crypto"] as const;

export function open(t: string, tab?: State["ui"]["tab"]) {
  ui({ sel: t, open: true, ...(tab ? { tab } : {}) });
}

export function RadarView() {
  const t = useT();
  const filter = useStore((s) => s.ui.filter);
  const list = visibleAssets(useStore((s) => s));
  const items = list.filter((a) => filter === "all" || a.kind === filter);
  return (
    <>
      <nav className="seg" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f} className={"chip k-" + f} aria-pressed={filter === f} onClick={() => ui({ filter: f })}>{t("f." + f)}</button>
        ))}
      </nav>
      <section className="board" aria-label="Quotes">
        {items.map((a) => <Ticker key={a.ticker} a={a} />)}
      </section>
      <Picks />
    </>
  );
}

function Ticker({ a }: { a: Asset }) {
  const t = useT();
  const s = useStore((x) => x);
  const al = assetAlert(s, a);
  const sel = s.ui.sel === a.ticker && s.ui.open;
  const sc = radarScore(a, s.hist[a.ticker]).total;
  const p0 = num(s.pos[a.ticker]?.p0);
  const ch = p0 > 0 && a.price ? (a.price / p0 - 1) * 100 : NaN;
  return (
    <button className={"tk k-" + a.kind + (al ? " al-" + al : "")} aria-pressed={sel} onClick={() => open(a.ticker, al === "green" || al === "red" ? "sell" : undefined)}>
      <span className="sym">
        <b>{displayTicker(a.ticker)}</b>
        {sc != null && <span className={"score s" + Math.floor(sc / 20)} title={t("score.title")}>{sc}</span>}
      </span>
      <small className="nm">{a.name}</small>
      <span className="px">{px(a)}</span>
      <span className={"chg " + cls(a.changePct)}>{arrow(a.changePct)}{pct(a.changePct)}</span>
      {p0 > 0 && <span className="buy">{t("buyAt")} {usd(p0)} <span className={cls(ch)}>({pct(ch)})</span></span>}
      {al && <span className="badge">{t("badge." + al)}</span>}
      <Sparkline hist={s.hist[a.ticker]} />
    </button>
  );
}

function Picks() {
  const t = useT();
  const d = useStore((s) => s.picks);
  const assets = useStore((s) => s.assets);
  const [pick, setPick] = useState<string | null>(null);
  if (!d?.picks?.length) return null;
  const x = d.picks.find((p) => p.ticker === pick) || d.picks[0];
  const c = x.consensus;
  const inRadar = assets[x.ticker] && !assets[x.ticker].hidden;
  const argRow = (g: PickArg, i: number) => (
    <div className="arg" key={i}>
      <span className={"tag " + g.type}>{g.type === "previsio" ? t("forecast") : g.type === "lectura" ? t("reading") : t("fact")}</span>
      <span>{g.text}</span>
      <span className="src">{g.source} {g.url && <a href={g.url} target="_blank" rel="noopener">↗</a>}</span>
    </div>
  );
  return (
    <section className="card picks">
      <div className="section-h"><h3>{t("pickTitle")}</h3><span className="hint">{t("reviewed")} {fmtDay(d.asOf)}</span></div>
      <p className="hint">{t("pickHint")}</p>
      <div className="pkrow">
        {d.picks.map((p, i) => {
          const up = p.consensus?.avg && p.consensus.price ? (p.consensus.avg / p.consensus.price - 1) * 100 : NaN;
          return (
            <button key={p.ticker} className="pk" aria-pressed={p.ticker === x.ticker} onClick={() => setPick(p.ticker)}>
              <span className="rank">#{i + 1}</span>
              <span className="sym">{p.ticker}</span>
              <span className="nm">{p.name}</span>
              <span className="banks">{p.banks.length} {t("banks")}</span>
              <span className={"ups " + cls(up)}>{isNaN(up) ? "" : t("potential") + " " + pct(up)}</span>
            </button>
          );
        })}
      </div>
      <div className="pkd">
        <div>
          <div className="label">{t("whoRecommends")}</div>
          <div className="list">
            {x.banks.map((b, i) => (
              <div className="bank" key={i}>
                <span><b>{b.bank}</b> · {b.list}</span>
                <span className="when">{fmtDay(b.date)} {b.date.slice(0, 4)}</span>
                <span className="nt">{b.note} {b.url && <a href={b.url} target="_blank" rel="noopener">{t("source")}</a>}</span>
              </div>
            ))}
          </div>
        </div>
        {c?.avg && c.price && (
          <div>
            <div className="cons">
              <span className={"pill " + ratingCls(c.rating)}>{c.rating}</span>
              <span className="hint">{c.analysts} {t("analysts")}</span>
              <span className={"upside " + cls(c.avg / c.price - 1)}>{t("potential")} {pct((c.avg / c.price - 1) * 100)}</span>
            </div>
            <RangeBar lo={c.low} hi={c.high} cur={c.price} mark={c.avg} labels={{ lo: t("min") + " " + nf(c.low, 0) + " $", hi: t("max") + " " + nf(c.high, 0) + " $" }} />
          </div>
        )}
        <div><div className="label">{t("whyRecommend")}</div><div className="list">{(x.args || []).map(argRow)}</div></div>
        {!!x.contra?.length && <div><div className="label">{t("contra")}</div><div className="list">{x.contra.map(argRow)}</div></div>}
        <div className="row-btns">
          {inRadar
            ? <button className="btn ghost" onClick={() => open(x.ticker, "anal")}>{t("openInRadar")}</button>
            : <button className="btn" onClick={() => addAsset({ ticker: x.ticker, name: x.name, kind: "stock" })}>{t("addToRadar")}</button>}
        </div>
      </div>
      <details className="cfg">
        <summary>{t("howChosen")}</summary>
        <p className="hint">{d.method}</p>
        <p className="hint">{d.caveat}</p>
        {!!d.runnersUp?.length && <p className="hint"><b>{t("offPodium")}: </b>{d.runnersUp.map((r) => `${r.name} (${r.note})`).join("; ")}.</p>}
      </details>
    </section>
  );
}
