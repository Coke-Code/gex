import { HistorySnap } from "../types";
import { REGIME_BAND_FILL, snapHedgingPressure } from "./historyRegime";
import { AXIS, FLIP, GRID, HOVER_BG, HOVER_BORDER, INK, NOTE, SPOT_LINE } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const P1 = "#60b077";
const N1 = "#be4245";
const A1 = "#7c3aed";

export default function HistoryLevelsChart({
  points,
  revision,
}: {
  points: HistorySnap[];
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(points), `${revision}:levels`);
  return (
    <div className="history-gf-levels">
      <PlotFrame plotRef={ref} onReset={reset} resetTitle="滚轮/拖拽仅缩放时间轴" />
    </div>
  );
}

function levelLine(rows: HistorySnap[], read: (row: HistorySnap) => number | null | undefined) {
  return rows.map((row) => {
    const value = read(row);
    return value != null && value > 0 ? value : null;
  });
}

function regimeShapes(times: Date[], rows: HistorySnap[]) {
  if (times.length < 2) return [];
  const shapes: object[] = [];
  for (let i = 0; i < times.length - 1; i += 1) {
    const pressure = snapHedgingPressure(rows[i]);
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: times[i],
      x1: times[i + 1],
      y0: 0,
      y1: 1,
      fillcolor: REGIME_BAND_FILL[pressure],
      line: { width: 0 },
      layer: "below",
    });
  }
  return shapes;
}

function build(points: HistorySnap[]) {
  const rows = points.slice(-120);
  const times = rows.map((row) => new Date(row.timestamp));
  const price = rows.map((row) => row.underlyingPrice);
  const flip = levelLine(rows, (row) => row.flipPoint);
  const p1 = levelLine(rows, (row) => row.levels?.p1 ?? null);
  const n1 = levelLine(rows, (row) => row.levels?.n1 ?? null);
  const a1 = levelLine(rows, (row) => row.levels?.a1 ?? null);
  return {
    traces: [
      {
        type: "scatter",
        mode: "lines",
        name: "现货",
        x: times,
        y: price,
        line: { color: SPOT_LINE, width: 2 },
        hovertemplate: "%{x}<br>现货 %{y:,.0f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Flip",
        x: times,
        y: flip,
        line: { color: FLIP, width: 1.2, dash: "dot" },
        connectgaps: false,
        hovertemplate: "%{x}<br>Flip %{y:,.0f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        name: "P1",
        x: times,
        y: p1,
        line: { color: P1, width: 1, dash: "dash" },
        connectgaps: false,
        hovertemplate: `%{x}<br>P1 %{y:,.0f}<extra></extra>`,
      },
      {
        type: "scatter",
        mode: "lines",
        name: "N1",
        x: times,
        y: n1,
        line: { color: N1, width: 1, dash: "dash" },
        connectgaps: false,
        hovertemplate: `%{x}<br>N1 %{y:,.0f}<extra></extra>`,
      },
      {
        type: "scatter",
        mode: "lines",
        name: "A1",
        x: times,
        y: a1,
        line: { color: A1, width: 1, dash: "dashdot" },
        connectgaps: false,
        hovertemplate: `%{x}<br>A1 %{y:,.0f}<extra></extra>`,
      },
    ],
    layout: {
      shapes: regimeShapes(times, rows),
      xaxis: {
        fixedrange: false,
        tickfont: { size: 8, color: AXIS },
        gridcolor: GRID,
        showspikes: true,
        spikemode: "across",
        spikecolor: NOTE,
        spikedash: "dot",
        spikethickness: 1,
      },
      yaxis: {
        fixedrange: true,
        tickformat: ".4s",
        gridcolor: GRID,
        tickfont: { size: 8, color: AXIS },
        title: { text: "关键价位", font: { size: 9, color: AXIS } },
      },
      margin: { l: 52, r: 10, t: 22, b: 24 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: true,
      legend: { orientation: "h", y: 1.18, x: 0, font: { size: 8, color: INK } },
      hovermode: "x unified",
      uirevision: "history-levels",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 11 },
        align: "left",
      },
    },
  };
}
