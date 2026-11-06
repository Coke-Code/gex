import { ExpirySlice } from "../types";
import { fmtBtc, fmtTenor, fmtUsd } from "./format";
import { barColors } from "./barColor";
import { AXIS, GRID, HOVER_BG, HOVER_BORDER, INK, NOTE, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const OI = "#8a7362";

export default function ExpiryMetricsChart({
  expiries,
  revision,
}: {
  expiries: ExpirySlice[];
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(expiries), `${revision}:expiry`);
  return (
    <div className="expiry-metrics-chart">
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

function build(expiries: ExpirySlice[]) {
  const rows = expiries.slice(0, 12);
  const labels = rows.map((row) => {
    const [, month, day] = row.expiry.split("-");
    return `${month}/${day} · ${fmtTenor(row.days)}`;
  });
  const net = rows.map((row) => row.netGex);
  const oi = rows.map((row) => row.oi ?? 0);

  return {
    traces: [
      {
        type: "bar",
        x: labels,
        y: net,
        marker: { color: barColors(net), line: { width: 0 } },
        customdata: net.map((value, index) =>
          `${labels[index]}<br>净 GEX ${value >= 0 ? "+" : "−"}${fmtUsd(Math.abs(value))}<br>OI ${fmtBtc(oi[index])}`,
        ),
        hovertemplate: "%{customdata}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        x: labels,
        y: oi,
        yaxis: "y2",
        line: { color: OI, width: 1.4 },
        marker: { size: 5, color: OI },
        hovertemplate: "%{x}<br>OI %{y:.3s} BTC<extra></extra>",
      },
    ],
    layout: {
      xaxis: {
        tickfont: { size: 8, color: AXIS },
        gridcolor: "transparent",
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
        tickfont: { size: 8, color: AXIS },
        title: { text: "净 GEX", font: { size: 9, color: AXIS } },
        fixedrange: true,
      },
      yaxis2: {
        overlaying: "y",
        side: "right",
        tickformat: ".2s",
        showgrid: false,
        tickfont: { size: 8, color: OI },
        title: { text: "OI (BTC)", font: { size: 9, color: OI } },
        fixedrange: true,
      },
      margin: { l: 44, r: 44, t: 2, b: 36 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      bargap: 0.32,
      hovermode: "x unified",
      uirevision: "expiry-net-oi",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 11 },
        align: "left",
      },
    },
  };
}
