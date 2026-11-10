import { HistorySnap } from "../types";
import { fmtPx, fmtUsd } from "./format";
import { buildHistoryHeatmap, heatmapZBounds } from "./historyHeatmap";
import {
  AXIS,
  GRID,
  HEATMAP_GEX,
  HOVER_BG,
  HOVER_BORDER,
  INK,
  NOTE,
  SPOT_LINE,
  ZERO,
} from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

export default function HistoryHeatmapChart({
  points,
  revision,
}: {
  points: HistorySnap[];
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(points), `${revision}:heatmap`);
  return (
    <div className="history-gf-heatmap">
      <PlotFrame plotRef={ref} onReset={reset} resetTitle="滚轮/拖拽仅缩放时间轴；纵轴为行权价" />
    </div>
  );
}

function build(points: HistorySnap[]) {
  const model = buildHistoryHeatmap(points);
  if (!model) {
    return {
      traces: [],
      layout: { uirevision: "history-heatmap-empty" },
    };
  }

  const z = model.z;
  const { zmax, zmin } = heatmapZBounds(z);
  const customdata = model.strikes.map((strike, row) =>
    model.times.map((time, col) => {
      const value = z[row][col];
      if (value == null) return `${time.toISOString()}<br>${fmtPx(strike)}<br>无快照`;
      return `${time.toISOString()}<br>${fmtPx(strike)}<br>净 GEX ${value >= 0 ? "+" : "−"}${fmtUsd(Math.abs(value))}<br>现货 ${fmtPx(model.prices[col])}`;
    }),
  );

  return {
    traces: [
      {
        type: "heatmap",
        x: model.times,
        y: model.strikes,
        z,
        customdata,
        colorscale: HEATMAP_GEX,
        zmid: 0,
        zmin,
        zmax,
        xgap: 0,
        ygap: 0,
        colorbar: {
          title: { text: "净 GEX", font: { size: 9, color: AXIS } },
          tickfont: { size: 8, color: AXIS },
          len: 0.7,
          bgcolor: "rgba(255,255,255,0.9)",
          bordercolor: HOVER_BORDER,
          outlinecolor: HOVER_BORDER,
          tickformat: ".2s",
        },
        hovertemplate: "%{customdata}<extra></extra>",
        showscale: true,
      },
      {
        type: "scatter",
        mode: "lines",
        name: "现货",
        x: model.times,
        y: model.prices,
        line: { color: SPOT_LINE, width: 2 },
        hovertemplate: "%{x}<br>现货 %{y:,.0f}<extra></extra>",
      },
    ],
    layout: {
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
        tickfont: { size: 8, color: AXIS },
        gridcolor: GRID,
        zerolinecolor: ZERO,
        title: { text: "行权价", font: { size: 9, color: AXIS } },
        autorange: true,
      },
      margin: { l: 54, r: 52, t: 4, b: 32 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      hovermode: "closest",
      uirevision: "history-heatmap-board",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 11 },
        align: "left",
      },
    },
  };
}

export function heatmapSubtitle(points: HistorySnap[]): string {
  const model = buildHistoryHeatmap(points);
  return model ? `${model.spanLabel} · 红/绿=净 GEX` : "现货邻域 · 净 GEX";
}
