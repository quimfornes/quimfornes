import { useId } from "react";
import type { Hist } from "../types";
import { cls } from "../lib/format";
import { sortedCloses } from "../lib/stats";

/** Trend line with soft area fill. Shape only: no scale, the numbers live next to it. */
export function Sparkline({ hist, n = 30, height = 34, className = "" }: { hist?: Hist; n?: number; height?: number; className?: string }) {
  const gid = useId();
  const v = sortedCloses(hist).slice(-n).map((x) => x.c);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const y = (c: number) => (hi === lo ? height / 2 : height - 3 - ((c - lo) / (hi - lo)) * (height - 6));
  const pts = v.map((c, i) => [(i / (v.length - 1)) * 100, y(c)] as const);
  const line = pts.map(([x, yy], i) => (i ? "L" : "M") + x.toFixed(2) + " " + yy.toFixed(2)).join(" ");
  const area = line + ` L100 ${height} L0 ${height} Z`;
  return (
    <svg className={"spark " + cls(v[v.length - 1] - v[0]) + " " + className} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Larger price chart with min/max labels and the last value. */
export function PriceChart({ hist, fmt }: { hist?: Hist; fmt: (v: number) => string }) {
  const gid = useId();
  const cs = sortedCloses(hist);
  if (cs.length < 2) return null;
  const v = cs.map((x) => x.c);
  const W = 320, H = 120;
  const lo = Math.min(...v), hi = Math.max(...v);
  const y = (c: number) => (hi === lo ? H / 2 : H - 8 - ((c - lo) / (hi - lo)) * (H - 16));
  const line = v.map((c, i) => (i ? "L" : "M") + ((i / (v.length - 1)) * W).toFixed(1) + " " + y(c).toFixed(1)).join(" ");
  const hiI = v.indexOf(hi), loI = v.indexOf(lo);
  return (
    <figure className={"pchart " + cls(v[v.length - 1] - v[0])}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".25" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={line + ` L${W} ${H} L0 ${H} Z`} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>{cs[0].d.slice(5).split("-").reverse().join("/")} → {cs[cs.length - 1].d.slice(5).split("-").reverse().join("/")}</span>
        <span>▲ {fmt(v[hiI])} · ▼ {fmt(v[loI])}</span>
      </figcaption>
    </figure>
  );
}

export function RangeBar({ lo, hi, cur, mark, labels }: { lo: number; hi: number; cur: number; mark?: number | null; labels: { lo: string; hi: string; mark?: string } }) {
  const min = Math.min(lo, cur, mark ?? lo), max = Math.max(hi, cur, mark ?? hi);
  const p = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div className="range">
      <div className="track">
        <div className="bar" />
        <div className="fill" style={{ left: p(lo) + "%", width: p(hi) - p(lo) + "%" }} />
        {mark != null && <div className="mk" style={{ left: p(mark) + "%" }} title={labels.mark} />}
        <div className="dot" style={{ left: p(cur) + "%" }} />
      </div>
      <div className="ends"><span>{labels.lo}</span><span>{labels.hi}</span></div>
    </div>
  );
}

/** Spider chart for the five Radar axes (0–100). Missing axes draw at the centre, dashed. */
export function RadarChart({ axes, size = 200 }: { axes: { label: string; value: number | null }[]; size?: number }) {
  const c = size / 2, R = size / 2 - 34, n = axes.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const poly = (r: (i: number) => number) => axes.map((_, i) => pt(i, r(i)).map((x) => x.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="radarchart" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={axes.map((a) => `${a.label}: ${a.value == null ? "N/D" : Math.round(a.value)}`).join(", ")}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={poly(() => R * f)} className="grid" />)}
      {axes.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="grid" />; })}
      <polygon points={poly((i) => R * ((axes[i].value ?? 0) / 100))} className="area" />
      {axes.map((a, i) => { const [x, y] = pt(i, R * ((a.value ?? 0) / 100)); return <circle key={i} cx={x} cy={y} r={3} className={a.value == null ? "nd" : "pt"} />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 18);
        return (
          <text key={i} x={x} y={y} textAnchor={Math.abs(x - c) < 4 ? "middle" : x > c ? "start" : "end"} dominantBaseline="middle">
            <tspan className="al">{a.label}</tspan>
            <tspan className="av" x={x} dy="12">{a.value == null ? "N/D" : Math.round(a.value)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export function Donut({ parts, size = 120 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const tot = parts.reduce((s, p) => s + p.value, 0);
  if (!(tot > 0)) return null;
  const r = size / 2 - 10, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="donut" aria-hidden="true">
      {parts.map((p) => {
        const len = (p.value / tot) * C;
        const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        acc += len;
        return el;
      })}
    </svg>
  );
}
