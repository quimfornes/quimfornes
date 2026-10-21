import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n";
import { Icon } from "./components/Icon";
import { assetAlert } from "./lib/derived";
import { displayTicker, fmtTime, setLocale } from "./lib/format";
import { getState, refreshAll, ui, useStore, visibleAssets, type View } from "./lib/store";
import { Detail } from "./views/Detail";
import { NewsView, PortfolioView, SettingsView } from "./views/OtherViews";
import { RadarView } from "./views/RadarView";

const NAV: [View, string][] = [["radar", "radar"], ["portfolio", "wallet"], ["news", "news"], ["settings", "gear"]];

export default function App() {
  const t = useT();
  const s = useStore((x) => x);
  const { view, open } = s.ui;
  setLocale(s.settings.lang);

  useEffect(() => {
    const root = document.documentElement;
    if (s.settings.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", s.settings.theme);
    root.lang = s.settings.lang;
  }, [s.settings.theme, s.settings.lang]);

  // refresh on open, every 5 min while visible, and whenever the app comes back to the foreground
  useEffect(() => {
    if (!s.settings.autoRefresh) return;
    const run = () => { if (document.visibilityState === "visible") void refreshAll(); };
    run();
    const id = setInterval(run, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", run);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", run); };
  }, [s.settings.autoRefresh]);

  // notify once per (asset, alert kind) when an alert newly fires
  const fired = useRef<Record<string, string | null>>({});
  useEffect(() => {
    const st = getState();
    for (const a of visibleAssets(st)) {
      const al = assetAlert(st, a);
      const prev = fired.current[a.ticker];
      fired.current[a.ticker] = al;
      if (al && prev !== undefined && prev !== al && st.settings.notify && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(displayTicker(a.ticker) + " · " + t("badge." + al), { body: a.name, tag: a.ticker + al }); } catch { /* iOS PWA without permission */ }
      }
    }
  }, [s.assets, s.pos, s.calc, s.fx]);

  const errs = s.refresh.errors.filter((e) => e !== "nokey");
  const srcName = (c: string) => ({ fx: "EUR/USD", crypto: t("f.crypto") } as Record<string, string>)[c] ?? c;
  return (
    <div className={"app" + (open ? " has-detail" : "")}>
      <header className="top">
        <div className="brand">
          <img src="icons/icon.svg" alt="" width="30" height="30" />
          <div>
            <h1>{t("appName")}</h1>
            <span className="stamp">
              {s.refresh.busy ? t("refreshing") : s.refresh.at ? t("updated") + " " + fmtTime(s.refresh.at) : t("snapshot") + " · " + fmtTime(s.meta?.updatedAt)}
            </span>
          </div>
        </div>
        <button className={"icon-btn" + (s.refresh.busy ? " spin" : "")} onClick={() => refreshAll()} aria-label={t("refresh")} disabled={s.refresh.busy}><Icon name="refresh" /></button>
      </header>

      <div className="layout">
        <main className="main">
          {view === "radar" && !s.settings.finnhubKey && <div className="notice">{t("snapshotNote")}</div>}
          {view === "radar" && errs.length > 0 && <div className="notice warn">{t("liveErr", { l: [...new Set(errs.map((e) => srcName(e.split(":")[0])))].join(", ") })}</div>}
          {view === "radar" && <RadarView />}
          {view === "portfolio" && <PortfolioView />}
          {view === "news" && <NewsView />}
          {view === "settings" && <SettingsView />}
          <footer className="foot">{t("disclaimer")}</footer>
        </main>
        <aside className={"side" + (open ? " open" : "")} aria-hidden={!open && undefined}>
          {open && <button className="icon-btn close only-wide" onClick={() => ui({ open: false })} aria-label={t("close")}><Icon name="close" /></button>}
          <Detail />
        </aside>
      </div>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(([v, ic]) => (
          <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => ui({ view: v, open: v === "radar" ? s.ui.open : false })}>
            <Icon name={ic} />
            <span>{t("nav." + v)}</span>
          </button>
        ))}
      </nav>
      {!s.ui.onboarded && <Onboarding />}
    </div>
  );
}

function Onboarding() {
  const t = useT();
  const [i, setI] = useState(0);
  const steps = [["radar", "ob.1t", "ob.1"], ["wallet", "ob.2t", "ob.2"], ["bell", "ob.3t", "ob.3"]];
  const [ic, tt, tx] = steps[i];
  const done = () => ui({ onboarded: true });
  return (
    <div className="onb" role="dialog" aria-modal="true">
      <div className="onb-card">
        <div className="onb-ic"><Icon name={ic} size={40} /></div>
        <h2>{t(tt)}</h2>
        <p>{t(tx)}</p>
        <div className="dots">{steps.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="row-btns">
          <button className="btn ghost" onClick={done}>{t("skip")}</button>
          <button className="btn" onClick={() => (i < steps.length - 1 ? setI(i + 1) : done())}>{i < steps.length - 1 ? t("next") : t("start")}</button>
        </div>
        <p className="hint">{t("disclaimer")}</p>
      </div>
    </div>
  );
}
