import { ChartMarker, MarkerKind, StrikeGex } from "../types";
import { fmtBtc, fmtUsd } from "./format";
import { barColors } from "./barColor";
import { AXIS, BAND, GRID, INK, LABEL_BG, NOTE, ZERO } from "./palette";
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

export default function SpaceChart(props: SpaceChartProps) {
  const { ref, reset } = usePlot(() => build(props), `${props.revision}:scale`, props.onPick);
  return <PlotFrame plotRef={ref} onReset={reset} />;
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

const MARK: Record<MarkerKind, { color: string; bg: string; ink: string; hint: string }> = {
  P: { color: "#1B8F4E", bg: "#1B8F4E", ink: "#ffffff", hint: "正峰。做市商在这里买跌卖涨，压波动。" },
  N: { color: "#D64550", bg: "#D64550", ink: "#ffffff", hint: "负峰。波动会被放大。拿来当止损，不要当支撑。" },
  A: { color: "#2F6FE0", bg: "#2F6FE0", ink: "#ffffff", hint: "绝对峰。总 Gamma 最大，临近到期容易被吸住。" },
  F: { color: "#b14ad4", bg: "#b14ad4", ink: "#b14ad4", hint: "翻转。净 Gamma 在这里过零。上面波动小，下面波动大。" },
  S: { color: "#C99600", bg: "#C99600", ink: "#ffffff", hint: "稳定点。预测里正 Gamma 最大的位置，回归最强。" },
  V: { color: "#E67A22", bg: "#E67A22", ink: "#ffffff", hint: "波动点。预测里负 Gamma 最大的位置，容易加速。" },
  GC: { color: "#1A1A1A", bg: "#1A1A1A", ink: "#ffffff", hint: "悬崖。预测斜率最陡，小波动会引出大对冲。" },
};

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
    annotations.push({
      x,
      y,
      yref,
      text,
      showarrow: false,
      yshift,
      font: { size: 12, color },
      bgcolor: bg,
      bordercolor: bg,
      borderwidth: 0,
      borderpad: 3,
    });
    if (!confluence) return;
    annotations.push({
      x,
      y,
      yref,
      text: "★",
      showarrow: false,
      yshift,
      xshift: 8 + text.length * 7,
      font: { size: 13, color: STAR },
      bgcolor: "transparent",
      borderwidth: 0,
    });
  };

  if (oneDay != null && oneDay > 0) {
    shapes.push({
      type: "rect",
      x0: price - oneDay,
      x1: price + oneDay,
      y0: 0,
      y1: 1,
      yref: "y domain",
      layer: "below",
      fillcolor: BAND,
      line: { width: 0 },
    });
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
      fill: "tozeroy",
      fillcolor: "rgba(140, 92, 196, 0.28)",
      line: { color: "#8c5cc4", width: 1.4 },
      hovertemplate: "%{x:,.0f}<br>绝对 %{y:.3s}<extra></extra>",
    },
  ];
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
    const dash = marker.kind === "V" ? "dash" : marker.kind === "GC" ? "dot" : "solid";
    shapes.push({
      type: "line",
      x0: marker.price,
      x1: marker.price,
      y0: 0,
      y1: 1,
      yref: "y domain",
      line: { color: style.color, width: 1.2, dash },
    });
    if (marker.kind === "F") {
      traces.push({
        type: "scatter",
        mode: "markers+text",
        x: [marker.price],
        y: [0],
        text: [marker.id],
        textposition: "top center",
        textfont: { size: 11, color: style.color },
        marker: { symbol: "diamond", size: 9, color: style.color },
        hovertemplate: `${markerNote(marker)}<extra></extra>`,
      });
      if (marker.confluence) {
        annotations.push({
          x: marker.price,
          y: 0,
          text: "★",
          showarrow: false,
          yshift: 16,
          xshift: 16,
          font: { size: 13, color: STAR },
          bgcolor: "transparent",
          borderwidth: 0,
        });
      }
      continue;
    }
    badge(marker.price, 0.27, marker.id, style.ink, style.bg, 0, "paper", marker.confluence);
    traces.push({
      type: "scatter",
      mode: "markers",
      x: [marker.price],
      y: [0],
      marker: { size: 7, color: style.color },
      hovertemplate: `${markerNote(marker)}<extra></extra>`,
    });
  }

  return {
    traces,
    layout: {
      xaxis: {
        anchor: "y2",
        range: [lo, hi],
        gridcolor: GRID,
        zeroline: false,
        tickfont: { size: 10, color: AXIS },
        fixedrange: false,
      },
      yaxis: {
        domain: [0.32, 1],
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 10, color: AXIS },
        title: { text: "美元 / 涨 1%", font: { size: 10, color: AXIS } },
        fixedrange: true,
      },
      yaxis2: {
        domain: [0, 0.22],
        tickformat: ".2s",
        gridcolor: "transparent",
        zeroline: false,
        tickfont: { size: 10, color: "#8c5cc4" },
        title: { text: "绝对", font: { size: 10, color: "#8c5cc4" } },
        fixedrange: true,
      },
      shapes,
      annotations,
      margin: { l: 56, r: 12, t: 8, b: 28 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      bargap: 0.15,
      uirevision: "space4",
      hovermode: "closest",
    },
  };
}
