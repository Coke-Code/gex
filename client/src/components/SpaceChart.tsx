import { useEffect, useLayoutEffect, useRef } from "react";
import { ChartMarker, MarkerKind, StrikeGex } from "../types";
import { fmtBtc, fmtPx, fmtUsd } from "./format";
import { barColors } from "./barColor";
import { AXIS, GRID, HOVER_BG, HOVER_BORDER, INK, LABEL_BG, NOTE, ZERO } from "./palette";
import { touchScrollFriendly } from "./plotTouch";
import { PlotFrame, usePlot } from "./usePlot.tsx";

interface SpaceChartProps {
  strikes: StrikeGex[];
  price: number;
  support: number | null;
  resistance: number | null;
  oneDay: number | null;
  markers: ChartMarker[];
  changeLabel: string | null;
  revision: string;
  onPick: (strike: number) => void;
}

function hover(row: StrikeGex, changeLabel: string | null): string {
  const lines = [
    row.strike.toLocaleString("en-US"),
    `净 ${row.netGex >= 0 ? "+" : "−"}${fmtUsd(Math.abs(row.netGex))}`,
    `Call ${fmtUsd(row.callGex)} · Put ${fmtUsd(row.putGex)}`,
    `未平仓 ${fmtBtc(row.oi)}`,
  ];
  if (row.volume != null) {
    lines.push(`24h 成交 ${fmtBtc(row.volume)}${row.volumePartial ? " · 部分来源" : ""}`);
  }
  if (changeLabel && row.netThen != null) {
    const delta = row.netGex - row.netThen;
    lines.push(`较 ${changeLabel}前 ${delta >= 0 ? "+" : "−"}${fmtUsd(Math.abs(delta))}`);
  }
  return lines.join("<br>");
}

const STAR = "#F5C518";

function markerNote(marker: ChartMarker): string {
  const hint = MARK[marker.kind].hint;
  return marker.confluence ? `${hint}<br>★ 和另一类标点叠在同一带` : hint;
}

const ABS_BOTTOM = 0.24;
const NET_TOP = 0.32;
const XAXIS_POS = 0.28;

const PAIR_BAND = {
  P: "rgba(27, 143, 78, 0.13)",
  N: "rgba(220, 72, 48, 0.14)",
  A: "rgba(47, 111, 224, 0.13)",
} as const;

function pushPairBand(
  shapes: object[],
  markers: ChartMarker[],
  idA: string,
  idB: string,
  fillcolor: string,
) {
  const a = markers.find((m) => m.id === idA);
  const b = markers.find((m) => m.id === idB);
  if (!a || !b) return;
  const x0 = Math.min(a.price, b.price);
  const x1 = Math.max(a.price, b.price);
  if (x1 <= x0) return;
  shapes.push({
    type: "rect",
    x0,
    x1,
    y0: 0,
    y1: 1,
    xref: "x",
    yref: "paper",
    layer: "below",
    fillcolor,
    line: { width: 0 },
  });
}

function strikeTick(strike: number): string {
  return strike % 1000 === 0 ? `${strike / 1000}k` : strike.toLocaleString("en-US");
}

const MAX_X_TICKS = 14;
const MIN_TICK_SPAN = 500;

function nearestStrike(strikes: number[], target: number): number {
  return strikes.reduce((best, strike) =>
    Math.abs(strike - target) < Math.abs(best - target) ? strike : best,
  );
}

function tickGapOk(chosen: number[], strike: number): boolean {
  return chosen.every((value) => Math.abs(value - strike) >= MIN_TICK_SPAN);
}

/** 悬崖竖带：约两条线宽，用现货比例换算成价位厚度。 */
function gcBandHalfWidth(spot: number): number {
  return Math.max(spot * 0.00012, 28);
}

/** 柱子在每个行权价上；横轴刻度至少相隔 MIN_TICK_SPAN，且不超过 MAX_X_TICKS。 */
function thinXAxisTicks(strikes: number[], pinPrices: number[]): number[] {
  if (strikes.length === 0) return [];

  const chosen: number[] = [];
  const add = (strike: number) => {
    if (tickGapOk(chosen, strike)) chosen.push(strike);
  };

  const pinned: number[] = [];
  const seen = new Set<number>();
  for (const price of pinPrices) {
    if (!(price > 0)) continue;
    const strike = nearestStrike(strikes, price);
    if (seen.has(strike)) continue;
    seen.add(strike);
    pinned.push(strike);
  }
  if (!seen.has(strikes[0])) pinned.push(strikes[0]);
  if (!seen.has(strikes[strikes.length - 1])) pinned.push(strikes[strikes.length - 1]);

  for (const strike of pinned) add(strike);

  const every = Math.max(1, Math.ceil(strikes.length / MAX_X_TICKS));
  for (let i = 0; i < strikes.length && chosen.length < MAX_X_TICKS; i += every) {
    add(strikes[i]);
  }
  for (const strike of strikes) {
    if (chosen.length >= MAX_X_TICKS) break;
    add(strike);
  }

  return chosen.sort((a, b) => a - b);
}

const MARK: Record<MarkerKind, { color: string; bg: string; ink: string; hint: string }> = {
  P: { color: "#1B8F4E", bg: "#1B8F4E", ink: "#ffffff", hint: "正峰。做市商在这里买跌卖涨，压波动。" },
  N: { color: "#D64550", bg: "#D64550", ink: "#ffffff", hint: "负峰。波动会被放大。拿来当止损，不要当支撑。" },
  A: { color: "#2F6FE0", bg: "#2F6FE0", ink: "#ffffff", hint: "绝对峰。总 Gamma 最大，临近到期容易被吸住。" },
  F: { color: "#b14ad4", bg: "#b14ad4", ink: "#ffffff", hint: "翻转。净 Gamma 在这里过零。上面波动小，下面波动大。" },
  S: { color: "#C99600", bg: "#C99600", ink: "#ffffff", hint: "稳定点。预测里正 Gamma 最大的位置，回归最强。" },
  V: { color: "#E67A22", bg: "#E67A22", ink: "#ffffff", hint: "波动点。预测里负 Gamma 最大的位置，容易加速。" },
  GC: { color: "#1A1A1A", bg: "#1A1A1A", ink: "#ffffff", hint: "悬崖。预测斜率最陡，小波动会引出大对冲。" },
};

const LEGEND: { id: string; name: string; bg: string; ink: string; border?: string }[] = [
  { id: "P1", name: "正峰", bg: MARK.P.bg, ink: MARK.P.ink },
  { id: "P2", name: "正峰", bg: MARK.P.bg, ink: MARK.P.ink },
  { id: "N1", name: "负峰", bg: MARK.N.bg, ink: MARK.N.ink },
  { id: "N2", name: "负峰", bg: MARK.N.bg, ink: MARK.N.ink },
  { id: "A1", name: "磁铁", bg: MARK.A.bg, ink: MARK.A.ink },
  { id: "A2", name: "磁铁", bg: MARK.A.bg, ink: MARK.A.ink },
  { id: "F", name: "翻转", bg: MARK.F.bg, ink: MARK.F.ink },
  { id: "S", name: "稳定", bg: "#ffffff", ink: "#1A1A1A", border: "#1A1A1A" },
  { id: "V", name: "放大", bg: MARK.V.bg, ink: MARK.V.ink },
  { id: "GC", name: "悬崖", bg: MARK.GC.bg, ink: MARK.GC.ink },
];

function legendMarker(
  markers: ChartMarker[],
  markerId: string,
  spot: number,
): ChartMarker | null {
  return (
    markers.find(
      (m) => m.id === markerId && m.price > spot * 0.82 && m.price < spot * 1.18,
    ) ?? null
  );
}

function MarkerLegend({ markers, price }: { markers: ChartMarker[]; price: number }) {
  return (
    <div className="marker-legend" aria-label="关键点标记">
      {LEGEND.map((item) => {
        const hit = legendMarker(markers, item.id, price);
        const values = hit ? fmtPx(hit.price) : null;
        return (
          <span key={item.id} className="marker-legend-item">
            <span
              className={`marker-legend-chip${hit?.confluence ? " has-star" : ""}`}
              style={{
                background: item.bg,
                color: item.ink,
                ...(item.border ? { boxShadow: `inset 0 0 0 1px ${item.border}` } : {}),
              }}
            >
              {item.id}
              {hit?.confluence ? (
                <span className="marker-legend-star-in" aria-hidden>
                  ★
                </span>
              ) : null}
            </span>
            <span className="marker-legend-copy">
              <span className="marker-legend-name">{item.name}</span>
              <span className={`marker-legend-val${values ? "" : " is-empty"}`}>{values ?? "—"}</span>
            </span>
          </span>
        );
      })}
      <span className="marker-legend-item">
        <span className="marker-legend-chip marker-legend-chip-star" aria-hidden>
          ★
        </span>
        <span className="marker-legend-copy">
          <span className="marker-legend-name">叠合</span>
          <span className="marker-legend-val is-meta">同类标点同价带</span>
        </span>
      </span>
    </div>
  );
}

export default function SpaceChart(props: SpaceChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { ref, reset, resize } = usePlot(() => build(props), `${props.revision}:scale`, {
    onPick: props.onPick,
    xHoverLabel: { y: XAXIS_POS, format: fmtPx },
  });

  useLayoutEffect(() => {
    resize();
  }, [props.revision, props.markers, resize]);

  useEffect(() => {
    if (touchScrollFriendly()) return;
    const root = chartRef.current;
    if (!root) return;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [resize]);

  return (
    <div className="space-chart" ref={chartRef}>
      <MarkerLegend markers={props.markers} price={props.price} />
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

function build(props: SpaceChartProps) {
  const { strikes, price, support, resistance, oneDay, markers, changeLabel } = props;
  const rows = strikes.filter(
    (row) => row.strike > price * 0.72 && row.strike < price * 1.28 && row.absGex > 0,
  );
  const x = rows.map((row) => row.strike);
  const width = x.map((strike, index) => {
    const left = index > 0 ? strike - x[index - 1] : x[1] ? x[1] - strike : price * 0.01;
    const right =
      index < x.length - 1 ? x[index + 1] - strike : index > 0 ? strike - x[index - 1] : price * 0.01;
    return Math.min((left + right) / 2, price * 0.015) * 0.82;
  });

  const shown = markers.filter((marker) => marker.price > price * 0.82 && marker.price < price * 1.18);
  const byStrike = new Map(rows.map((row) => [row.strike, row]));
  const noteAt = new Map<number, string[]>();
  for (const marker of shown) {
    if (marker.kind !== "P" && marker.kind !== "N" && marker.kind !== "A") continue;
    const list = noteAt.get(marker.price) ?? [];
    list.push(markerNote(marker));
    noteAt.set(marker.price, list);
  }
  const marks = [price, support, resistance, ...shown.map((marker) => marker.price)].filter(
    (value): value is number => value != null && value > 0,
  );
  const pad = price * 0.015;
  const lo = Math.min(price * 0.9, ...marks) - pad;
  const hi = Math.max(price * 1.1, ...marks) + pad;

  const shapes: object[] = [];
  const annotations: object[] = [];
  const badge = (
    x: number,
    y: number,
    text: string,
    color: string,
    bg: string,
    yshift: number,
    yref?: string,
    confluence = false,
  ) => {
    const borderpad = 3;
    const fontSize = 12;
    const charW = 6.5;
    const starReserve = confluence ? 10 : 0;
    const padChars = confluence
      ? Math.max(0, Math.ceil(starReserve / charW))
      : 0;
    const displayText = padChars ? `${text}${"\u2009".repeat(padChars)}` : text;
    const boxW = displayText.length * charW + borderpad * 2;
    const boxH = fontSize + borderpad * 2;
    annotations.push({
      x,
      y,
      yref,
      text: displayText,
      showarrow: false,
      yshift,
      font: { size: fontSize, color },
      bgcolor: bg,
      bordercolor: bg,
      borderwidth: 0,
      borderpad,
    });
    if (!confluence) return;
    annotations.push({
      x,
      y,
      yref,
      text: "★",
      showarrow: false,
      yshift: yshift + boxH / 2 - 5,
      xshift: boxW / 2 - 4,
      font: { size: 8, color: STAR },
      bgcolor: "transparent",
      borderwidth: 0,
    });
  };

  const starInCircle = (x: number, y: number, yref: string | undefined, radius = 10) => {
    annotations.push({
      x,
      y,
      yref,
      text: "★",
      showarrow: false,
      xshift: radius * 0.55,
      yshift: radius * 0.55,
      font: { size: 8, color: STAR },
      bgcolor: "transparent",
      borderwidth: 0,
    });
  };

  pushPairBand(shapes, shown, "P1", "P2", PAIR_BAND.P);
  pushPairBand(shapes, shown, "N1", "N2", PAIR_BAND.N);
  pushPairBand(shapes, shown, "A1", "A2", PAIR_BAND.A);

  if (oneDay != null && oneDay > 0) {
    annotations.push(
      { x: price - oneDay, y: 0.08, yref: "y domain", text: "−1日", showarrow: false, font: { size: 10, color: NOTE } },
      { x: price + oneDay, y: 0.08, yref: "y domain", text: "+1日", showarrow: false, font: { size: 10, color: NOTE } },
    );
  }
  shapes.push({
    type: "line",
    x0: price,
    x1: price,
    y0: 0,
    y1: 1,
    yref: "y domain",
    line: { color: INK, width: 1.2, dash: "dash" },
  });
  annotations.push({
    x: price,
    y: 0.97,
    yref: "y domain",
    text: Math.round(price).toLocaleString("en-US"),
    showarrow: false,
    font: { size: 11, color: INK },
    bgcolor: LABEL_BG,
  });

  const traces: object[] = [
    {
      type: "bar",
      x,
      y: rows.map((row) => row.netGex),
      width,
      marker: {
        color: barColors(rows.map((row) => row.netGex)),
      },
      customdata: rows.map((row) => {
        const note = noteAt.get(row.strike);
        const text = hover(row, changeLabel);
        return note ? `${text}<br>${note.join("<br>")}` : text;
      }),
      hovertemplate: "%{customdata}<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      x,
      y: rows.map((row) => row.absGex),
      yaxis: "y2",
      line: { color: "#8c5cc4", width: 1.4 },
      hovertemplate: "%{x:,.0f}<br>绝对 %{y:.3s}<extra></extra>",
    },
  ];
  const xTicks = thinXAxisTicks(x, marks);

  for (const marker of shown) {
    const style = MARK[marker.kind];
    const row = byStrike.get(marker.price);
    if (marker.kind === "P" || marker.kind === "N") {
      if (!row) continue;
      badge(row.strike, row.netGex, marker.id, style.ink, style.bg, row.netGex >= 0 ? 14 : -14, undefined, marker.confluence);
      continue;
    }
    if (marker.kind === "A") {
      if (!row) continue;
      badge(row.strike, row.absGex, marker.id, style.ink, style.bg, 12, "y2", marker.confluence);
      continue;
    }
    if (marker.kind === "GC") {
      const half = gcBandHalfWidth(price);
      shapes.push({
        type: "rect",
        x0: marker.price - half,
        x1: marker.price + half,
        y0: 0,
        y1: 1,
        xref: "x",
        yref: "paper",
        layer: "below",
        fillcolor: "#1A1A1A",
        line: { width: 0 },
      });
      badge(marker.price, XAXIS_POS - 0.01, marker.id, style.ink, style.bg, 0, "paper", marker.confluence);
      continue;
    }
    if (marker.kind === "F") {
      traces.push({
        type: "scatter",
        mode: "markers",
        x: [marker.price],
        y: [0],
        marker: { symbol: "diamond", size: 16, color: style.color },
        hoverinfo: "skip",
      });
      badge(marker.price, 0, marker.id, style.ink, style.bg, -14, "paper", marker.confluence);
      continue;
    }
    if (marker.kind === "S" || marker.kind === "V") {
      const axisTag =
        marker.kind === "S"
          ? { fill: "#ffffff", ink: "#1A1A1A", line: { width: 1, color: "#1A1A1A" } }
          : { fill: style.bg, ink: style.ink, line: { width: 0, color: style.bg } };
      const circleSize = marker.confluence ? 24 : 20;
      traces.push({
        type: "scatter",
        mode: "markers+text",
        x: [marker.price],
        y: [0],
        text: [marker.id],
        textposition: "middle center",
        textfont: { size: 11, color: axisTag.ink },
        marker: { symbol: "circle", size: circleSize, color: axisTag.fill, line: axisTag.line },
        hoverinfo: "skip",
      });
      if (marker.confluence) starInCircle(marker.price, 0, "paper", circleSize / 2);
      continue;
    }
  }

  return {
    traces,
    layout: {
      xaxis: {
        type: "linear",
        anchor: "free",
        position: XAXIS_POS,
        range: [lo, hi],
        tickmode: "array",
        tickvals: xTicks,
        ticktext: xTicks.map(strikeTick),
        tickangle: xTicks.length > 11 ? -45 : 0,
        tickfont: { size: 9, color: AXIS },
        showgrid: false,
        zeroline: false,
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikecolor: NOTE,
        spikedash: "dot",
        spikethickness: 1,
        fixedrange: false,
      },
      yaxis: {
        anchor: "x",
        domain: [NET_TOP, 1],
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 10, color: AXIS },
        title: { text: "美元 / ±1% 波动", font: { size: 10, color: AXIS } },
        fixedrange: true,
      },
      yaxis2: {
        anchor: "x",
        domain: [0, ABS_BOTTOM],
        tickformat: ".2s",
        gridcolor: "transparent",
        zeroline: false,
        tickfont: { size: 10, color: "#8c5cc4" },
        title: { text: "绝对", font: { size: 10, color: "#8c5cc4" } },
        fixedrange: true,
      },
      shapes,
      annotations,
      margin: { l: 48, r: 8, t: 4, b: 28 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      bargap: 0.15,
      uirevision: "space-median5",
      hovermode: "x unified",
      hoverdistance: 24,
      spikedistance: -1,
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
