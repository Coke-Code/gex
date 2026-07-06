// GEX Chart — Plotly from CDN (native API)
import { useMemo, useState, useEffect, useRef } from "react";
import { StrikeGex } from "../types";

interface GexChartProps {
  strikes: StrikeGex[];
  underlyingPrice: number;
  flipZone: { low: number; high: number } | null;
  flipPoint: number | null;
}

const C = {
  green: "#60b077",
  red: "#bb4244",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#8b5cf6",
  orange: "#d97706",
  gold: "#f59e0b",
  spot: "#1a1d26",
  grid: "#eef0f3",
  axis: "#9ca3af",
};
interface KL {
  label: string;
  strike: number;
  netGex: number;
  absGex: number;
  color: string;
  desc: string;
  confluent: boolean;
}

function findKeyLevels(strikes: StrikeGex[], underlyingPrice: number): KL[] {
  const raw: KL[] = [];
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  // S: Stability Point — 全局最大正 netGex，交易员在此逢低买逢高卖，波动率最低
  const sBest = sorted
    .filter((s) => s.netGex > 0)
    .sort((a, b) => b.netGex - a.netGex)[0];
  if (sBest) {
    raw.push({
      label: "S",
      strike: sBest.strike,
      netGex: sBest.netGex,
      absGex: sBest.absGex,
      color: C.orange,
      desc: "最大稳定区",
      confluent: false,
    });
  }

  const abss = [...sorted]
    .filter(
      (s, i) =>
        i > 0 &&
        i < sorted.length - 1 &&
        s.absGex > sorted[i - 1].absGex &&
        s.absGex > sorted[i + 1].absGex,
    )
    .sort((a, b) => b.absGex - a.absGex);
  abss.slice(0, 2).forEach((s, i) =>
    raw.push({
      label: `A${i + 1}`,
      strike: s.strike,
      netGex: s.netGex,
      absGex: s.absGex,
      color: C.blue,
      desc: "磁吸区",
      confluent: false,
    }),
  );
  const lowerNegative = sorted
    .filter((s) => s.strike < underlyingPrice && s.netGex < 0)
    .map((s) => ({
      ...s,
      score: Math.abs(s.netGex) / Math.max(1, underlyingPrice - s.strike),
    }))
    .sort((a, b) => b.score - a.score);

  const negs: typeof lowerNegative = [];
  const minDist = underlyingPrice * 0.01;

  for (const s of lowerNegative) {
    const tooClose = negs.some((n) => Math.abs(n.strike - s.strike) < minDist);

    if (!tooClose) {
      negs.push(s);
    }

    if (negs.length >= 2) break;
  }

  negs.forEach((s, i) =>
    raw.push({
      label: `N${i + 1}`,
      strike: s.strike,
      netGex: s.netGex,
      absGex: s.absGex,
      color: C.red,
      desc: "波动放大区",
      confluent: false,
    }),
  );
  // P: Positive Gamma Peaks — 正 netGex 第2、第3名（S已占第1），做市商稳定价格
  const positiveSorted = sorted
    .filter((s) => s.netGex > 0 && !raw.find((l) => l.strike === s.strike))
    .sort((a, b) => b.netGex - a.netGex);

  const poss: typeof positiveSorted = [];
  for (const s of positiveSorted) {
    const tooClose = poss.some((p) => Math.abs(p.strike - s.strike) < minDist);
    if (!tooClose) poss.push(s);
    if (poss.length >= 2) break;
  }

  poss.forEach((s, i) =>
    raw.push({
      label: `P${i + 1}`,
      strike: s.strike,
      netGex: s.netGex,
      absGex: s.absGex,
      color: C.yellow,
      desc: "正伽马峰",
      confluent: false,
    }),
  );
  const v = [...sorted].sort((a, b) => a.netGex - b.netGex)[0];
  if (v)
    raw.push({
      label: "V",
      strike: v.strike,
      netGex: v.netGex,
      absGex: v.absGex,
      color: C.blue,
      desc: "波动放大器",
      confluent: false,
    });

  return raw;
}
function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

export default function GexChart({
  strikes,
  underlyingPrice,
  flipPoint,
}: GexChartProps) {
  const [showPos, setShowPos] = useState(true);
  const [showNeg, setShowNeg] = useState(true);
  const [showCall, setShowCall] = useState(true);
  const [showPut, setShowPut] = useState(true);
  const [showRegime, setShowRegime] = useState(true);
  const kl = useMemo(
    () => findKeyLevels(strikes, underlyingPrice),
    [strikes, underlyingPrice],
  );
  // 固定初始视图 ±17.5%，缩放由 Plotly 原生 scrollZoom 处理（不依赖可变状态）
  const INITIAL_ZOOM_PCT = 35;
  const cd = useMemo(() => {
    const r = (underlyingPrice * INITIAL_ZOOM_PCT) / 100;
    return strikes.filter(
      (s) =>
        s.strike >= underlyingPrice - r / 2 &&
        s.strike <= underlyingPrice + r / 2,
    );
  }, [strikes, underlyingPrice]);
  const x = cd.map((d) => d.strike),
    ng = cd.map((d) => d.netGex),
    cg = cd.map((d) => d.callGex),
    pg = cd.map((d) => d.putGex);

  // 柱宽 = 到左右邻居距离的均值 × 0.9（保留视觉缝隙）
  const barWidths = x.map((v, i) => {
    const left = i > 0 ? v - x[i - 1] : i < x.length - 1 ? x[i + 1] - v : 500;
    const right = i < x.length - 1 ? x[i + 1] - v : i > 0 ? v - x[i - 1] : 500;
    return ((left + right) / 2) * 0.9;
  });

  const shapes: any[] = [],
    annotations: any[] = [];
  // Spot price line + dash
  shapes.push({
    type: "line",
    x0: underlyingPrice,
    x1: underlyingPrice,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: { color: C.spot, width: 1.5, dash: "dash" },
  });
  annotations.push({
    x: underlyingPrice,
    y: 26,
    xref: "x",
    yref: "paper",
    text: `<b>${underlyingPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>`,
    showarrow: false,
    xanchor: "center",
    yanchor: "bottom",
    font: { color: C.spot, size: 11 },
    bgcolor: "rgba(255,255,255,0.85)",
    borderpad: { l: 4, r: 4, t: 2, b: 2 },
  });
  // Spot price label at bottom (xaxis2)
  annotations.push({
    x: underlyingPrice,
    y: -36,
    xref: "x",
    yref: "paper",
    text: `<b>${underlyingPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>`,
    showarrow: true,
    arrowhead: 2,
    arrowsize: 1,
    arrowwidth: 1,
    arrowcolor: C.spot,
    ax: 0,
    ay: 28,
    xanchor: "center",
    yanchor: "top",
    font: { color: C.spot, size: 11 },
    bgcolor: "rgba(255,255,255,0.85)",
    borderpad: { l: 4, r: 4, t: 2, b: 2 },
  });

  // Flip Point (F) marker on zero line
  if (flipPoint != null) {
    shapes.push({
      type: "line",
      x0: flipPoint,
      x1: flipPoint,
      y0: 0,
      y1: 1,
      yref: "paper",
      line: { color: C.orange, width: 1.8, dash: "solid" },
      opacity: 0.7,
    });
    annotations.push({
      x: flipPoint,
      y: 0,
      xref: "x",
      yref: "y",
      text: "<b>F</b>",
      showarrow: false,
      font: { color: "#fff", size: 10 },
      bgcolor: C.orange,
      borderpad: { l: 4, r: 4, t: 2, b: 2 },
      xanchor: "center",
      yanchor: "middle",
    });
  }

  // Zone fills & key levels — controlled by Regime toggle
  if (showRegime) {
    const nLvls = kl
      .filter((l) => l.label.startsWith("N"))
      .sort((a, b) => a.strike - b.strike);
    const pLvls = kl
      .filter((l) => l.label.startsWith("P"))
      .sort((a, b) => a.strike - b.strike);
    const aLvls = kl
      .filter((l) => l.label.startsWith("A"))
      .sort((a, b) => a.strike - b.strike);
    for (const [levels, color, opacity] of [
      [nLvls, C.green, 0.2],
      [pLvls, C.yellow, 0.2],
      [aLvls, C.blue, 0.2],
    ] as any) {
      if (levels.length >= 2) {
        shapes.push({
          type: "rect",
          x0: levels[0].strike,
          x1: levels[1].strike,
          y0: 0,
          y1: 1,
          yref: "paper",
          fillcolor: color,
          opacity,
          line: { width: 0 },
          layer: "below",
        });
      }
    }
    // Key levels
    for (const l of kl) {
      const iA = l.label.startsWith("A"),
        iN = l.label.startsWith("N"),
        iSV = l.label === "S" || l.label === "V",
        bc = l.color,
        lt = l.confluent ? `${l.label}\u2605` : l.label;
      shapes.push({
        type: "line",
        x0: l.strike,
        x1: l.strike,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: {
          color: bc,
          width: l.confluent ? 1.5 : 1,
          dash: l.confluent ? "dashdot" : iN ? "dot" : "dash",
        },
        opacity: l.confluent ? 0.7 : iN ? 0.4 : 0.5,
      });
      annotations.push({
        x: l.strike,
        y: iA
          ? (() => {
              const d = cd.find((s) => s.strike === l.strike);
              return d ? Math.max(d.callGex, d.putGex) : 0;
            })()
          : iSV
            ? 0
            : l.netGex,
        xref: "x",
        yref: iA ? "y2" : "y",
        text: `<b>${lt}</b>`,
        showarrow: false,
        font: { color: iSV ? bc : "#fff", size: iSV ? 12 : 9 },
        bgcolor: iSV ? "rgba(0,0,0,0)" : bc,
        bordercolor: iSV ? "rgba(0,0,0,0)" : bc,
        borderpad: { l: 4, r: 4, t: 2, b: 2 },
        ay: iA ? -26 : iSV ? 0 : l.netGex >= 0 ? -26 : 26,
      });
    }
  }

  const posBars = ng.map((v: number) => (v >= 0 ? v : null));
  const negBars = ng.map((v: number) => (v < 0 ? v : null));

  // 柱状图颜色：只使用四种固定颜色，按中位数分亮暗
  const posVals = ng.filter((v: number) => v > 0);
  const negVals = ng
    .filter((v: number) => v < 0)
    .map((v: number) => Math.abs(v));
  const posMid =
    posVals.length > 0
      ? posVals.sort((a, b) => a - b)[Math.floor(posVals.length / 2)]
      : 0;
  const negMid =
    negVals.length > 0
      ? negVals.sort((a, b) => a - b)[Math.floor(negVals.length / 2)]
      : 0;
  const posColors = ng.map((v: number) => {
    if (v <= 0) return "transparent";
    return v >= posMid ? "#5eb175" : "#39674c";
  });
  const negColors = ng.map((v: number) => {
    if (v >= 0) return "transparent";
    return Math.abs(v) >= negMid ? "#bb4244" : "#5b272b";
  });

  const traces: any[] = [
    {
      x,
      y: posBars,
      width: barWidths,
      type: "bar",
      name: "正GEX",
      visible: showPos,
      marker: { color: posColors },
      xaxis: "x",
      yaxis: "y",
      hovertemplate: "%{x:$,.0f}<br>+GEX: %{y:$,.2s}<extra></extra>",
    },
    {
      x,
      y: negBars,
      width: barWidths,
      type: "bar",
      name: "负GEX",
      visible: showNeg,
      marker: { color: negColors },
      xaxis: "x",
      yaxis: "y",
      hovertemplate: "%{x:$,.0f}<br>-GEX: %{y:$,.2s}<extra></extra>",
    },
    {
      x,
      y: cg,
      type: "scatter",
      name: "Call",
      visible: showCall,
      mode: "lines",
      fill: "tozeroy",
      line: { color: C.green, width: 1.5, shape: "spline", smoothing: 0.8 },
      fillcolor: "rgba(34,197,94,0.30)",
      xaxis: "x",
      yaxis: "y2",
      hovertemplate: "%{x:$,.0f}<br>Call GEX: %{y:$,.2s}<extra></extra>",
    },
    {
      x,
      y: pg,
      type: "scatter",
      name: "Put",
      visible: showPut,
      mode: "lines",
      fill: "tozeroy",
      line: { color: "#a78bfa", width: 1.5, shape: "spline", smoothing: 0.8 },
      fillcolor: "rgba(167,139,250,0.30)",
      xaxis: "x",
      yaxis: "y2",
      hovertemplate: "%{x:$,.0f}<br>Put GEX: %{y:$,.2s}<extra></extra>",
    },
  ];

  const layout: any = {
    xaxis: {
      domain: [0, 1],
      anchor: "y",
      showticklabels: true,
      zeroline: false,
      gridcolor: C.grid,
      fixedrange: false,
    },
    yaxis: {
      domain: [0.55, 0.98],
      title: { text: "净GEX / 1%波动", font: { color: C.axis, size: 10 } },
      tickformat: ".2s",
      tickfont: { color: C.axis, size: 10 },
      gridcolor: C.grid,
      zerolinecolor: "#d0d5dd",
      zerolinewidth: 1,
      fixedrange: true,
    },
    yaxis2: {
      domain: [0.02, 0.46],
      title: { text: "Call / Put", font: { color: C.axis, size: 10 } },
      tickformat: ".2s",
      tickfont: { color: C.axis, size: 10 },
      gridcolor: C.grid,
      rangemode: "nonnegative",
      fixedrange: true,
    },
    shapes,
    annotations,
    margin: { l: 56, r: 12, t: 16, b: 68 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
    showlegend: false,
    dragmode: "pan",
    height: window.innerWidth < 768 ? 340 : 480,
    hovermode: "x unified",
    hoversubplots: "axis",
    bargap: 0.15,
    barmode: "relative",
    showspikes: true,
    spikemode: "across",
    uirevision: "no-reset",
  };
  const config = { displayModeBar: false, responsive: true, scrollZoom: true };

  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plotRef.current) return;
    // 更新 traces 可见性
    const visible: boolean[] = [showPos, showNeg, showCall, showPut];
    const data = traces.map((t, i) => {
      if (i < 4) return { ...t, visible: visible[i] ? true : "legendonly" };
      return t;
    });
    window.Plotly.react(plotRef.current, data, layout, config);
  }, [traces, layout, config, showPos, showNeg, showCall, showPut]);

  // resize handler
  useEffect(() => {
    const handleResize = () => {
      if (plotRef.current) {
        window.Plotly.Plots.resize(plotRef.current);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={{ width: "100%" }}>
      <div ref={plotRef} style={{ width: "100%", minHeight: 320 }} />
      <div className="gex-layer-toggles" style={{ marginTop: 4 }}>
        {(
          [
            ["正GEX", showPos, setShowPos],
            ["负GEX", showNeg, setShowNeg],
            ["Call", showCall, setShowCall],
            ["Put", showPut, setShowPut],
            ["标记", showRegime, setShowRegime],
          ] as const
        ).map(([label, active, setActive]) => (
          <button
            key={label}
            onClick={() => setActive(!active)}
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              border: active ? "none" : "1px solid #d0d5dd",
              background: active
                ? "linear-gradient(135deg, #8b5cf6, #6366f1)"
                : "transparent",
              color: active ? "#fff" : C.axis,
              fontSize: 10,
              fontWeight: active ? 600 : 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              boxShadow: active ? "0 1px 3px rgba(139,92,246,0.3)" : "none",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {kl.map((l) => {
          const bc = l.confluent ? C.gold : l.color;
          const val = l.label.startsWith("A")
            ? l.absGex
            : l.label === "F"
              ? 0
              : l.netGex;
          const valStr = l.label === "F" ? "\u2014" : fmt(val);
          const peak = l.label.startsWith("A")
            ? cd.find((s) => s.strike === l.strike)
            : null;
          return (
            <div
              key={l.label}
              style={{
                background: "#fff",
                borderRadius: 6,
                border: "1px solid #c0c4cc",
                padding: "4px 8px",
                minWidth: 75,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 16,
                  borderRadius: 3,
                  background: bc,
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 700,
                }}
              >
                {l.confluent ? `${l.label}\u2605` : l.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1d26" }}>
                {l.strike.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: l.label === "F" ? "#999" : val >= 0 ? C.green : C.red,
                }}
              >
                {l.label.startsWith("A")
                  ? fmt(l.absGex)
                  : l.label === "F"
                    ? "\u2014"
                    : fmt(l.netGex)}
              </span>
              <span style={{ fontSize: 8, color: C.axis, lineHeight: 1 }}>
                {l.desc}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
