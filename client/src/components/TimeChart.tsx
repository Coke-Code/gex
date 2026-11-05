import { ExpirySlice } from "../types";
import { fmtTenor } from "./format";
import { barColors } from "./barColor";
import { AXIS, GRID, INK, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

export default function TimeChart({
  expiries,
  revision,
}: {
  expiries: ExpirySlice[];
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(expiries), `${revision}:scale`);
  return <PlotFrame plotRef={ref} onReset={reset} />;
}

function build(expiries: ExpirySlice[]) {
  const rows = expiries.slice(0, 8);
  const labels = rows.map((row) => {
    const [, month, day] = row.expiry.split("-");
    return `${month}/${day} · ${fmtTenor(row.days)}`;
  });
  return {
    traces: [
      {
        type: "bar",
        x: labels,
        y: rows.map((row) => row.netGex),
        marker: {
          color: barColors(rows.map((row) => row.netGex)),
        },
        hovertemplate: "%{x}<br>净 Gamma %{y:.3s}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        x: labels,
        y: rows.map((row) => (row.atmIv == null ? null : row.atmIv * 100)),
        yaxis: "y2",
        line: { color: INK, width: 1.6 },
        marker: { size: 6, color: INK },
        hovertemplate: "%{x}<br>平值 IV %{y:.1f}%<extra></extra>",
      },
    ],
    layout: {
      xaxis: {
        tickfont: { size: 10, color: AXIS },
        gridcolor: "transparent",
      },
      yaxis: {
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 10, color: AXIS },
        title: { text: "美元 / 涨 1%", font: { size: 10, color: AXIS } },
        fixedrange: true,
      },
      yaxis2: {
        overlaying: "y",
        side: "right",
        ticksuffix: "%",
        showgrid: false,
        tickfont: { size: 10, color: AXIS },
        title: { text: "平值 IV", font: { size: 10, color: AXIS } },
        fixedrange: true,
      },
      margin: { l: 52, r: 42, t: 8, b: 48 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      bargap: 0.35,
      uirevision: "time",
    },
  };
}
