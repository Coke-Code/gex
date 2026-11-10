import { StrikeGex } from "../types";
import { fmtBtc, fmtPx } from "./format";
import { oiNearSpot } from "./oiRows";
import { AXIS, GRID, HOVER_BG, HOVER_BORDER, INK, LABEL_BG, NOTE, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const OI = "#8a7362";
const WALL = "#c4843a";

export default function OiWallChart({
  strikes,
  price,
  revision,
}: {
  strikes: StrikeGex[];
  price: number;
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(strikes, price), `${revision}:oiwall`);
  return (
    <div className="oi-wall-chart">
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

function build(strikes: StrikeGex[], price: number) {
  const rows = oiNearSpot(strikes, price);
  const x = rows.map((row) => row.strike);
  const y = rows.map((row) => row.oi);
  const top = new Set(
    [...rows].sort((a, b) => b.oi - a.oi).slice(0, 3).map((row) => row.strike),
  );
  const colors = x.map((strike) => (top.has(strike) ? WALL : OI));
  const width = x.map((strike, index) => {
    const left = index > 0 ? strike - x[index - 1] : x[1] ? x[1] - strike : price * 0.01;
    const right =
      index < x.length - 1 ? x[index + 1] - strike : index > 0 ? strike - x[index - 1] : price * 0.01;
    return Math.min((left + right) / 2, price * 0.015) * 0.82;
  });

  const pad = price * 0.02;
  const lo = Math.min(price * 0.88, ...x, price) - pad;
  const hi = Math.max(price * 1.12, ...x, price) + pad;

  return {
    traces: [
      {
        type: "bar",
        x,
        y,
        width,
        marker: { color: colors, line: { width: 0 } },
        customdata: y.map((oi, index) => {
          const wall = top.has(x[index]);
          return `${fmtPx(x[index])}${wall ? " · OI 墙" : ""}<br>OI ${fmtBtc(oi)}<br>净 GEX 见空间图`;
        }),
        hovertemplate: "%{customdata}<extra></extra>",
      },
    ],
    shapes: [
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: price,
        x1: price,
        y0: 0,
        y1: 1,
        line: { color: NOTE, width: 1, dash: "dash" },
      },
    ],
    annotations: [
      {
        x: price,
        y: 1,
        xref: "x",
        yref: "paper",
        text: "现价",
        showarrow: false,
        font: { size: 9, color: NOTE },
        bgcolor: LABEL_BG,
        borderwidth: 0,
        yanchor: "bottom",
      },
    ],
    layout: {
      xaxis: {
        range: [lo, hi],
        tickformat: ".4s",
        tickfont: { size: 8, color: AXIS },
        gridcolor: GRID,
        showspikes: true,
        spikemode: "across",
        spikecolor: NOTE,
        spikedash: "dot",
        spikethickness: 1,
      },
      yaxis: {
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 8, color: OI },
        title: { text: "OI (BTC)", font: { size: 9, color: OI } },
      },
      margin: { l: 44, r: 12, t: 4, b: 32 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      bargap: 0.08,
      hovermode: "closest",
      uirevision: "oi-wall",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 11 },
        align: "left",
      },
    },
  };
}

export function oiWallNote(strikes: StrikeGex[], price: number): string {
  const rows = oiNearSpot(strikes, price);
  if (rows.length === 0) return "现货 ±25%";
  const top = [...rows].sort((a, b) => b.oi - a.oi)[0];
  return `现货 ±25% · 最厚 ${fmtPx(top.strike)}（${fmtBtc(top.oi)}）· 橘柱前 3 档`;
}
