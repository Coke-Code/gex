import { ExpirySlice, SkewSlice } from "../types";
import { fmtTenor } from "./format";
import { AXIS, GRID, HOVER_BG, HOVER_BORDER, INK, NOTE, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const IV = "#7c3aed";
const RR = "#c4843a";

export default function VolSkewChart({
  expiries,
  skewTerm,
  revision,
}: {
  expiries: ExpirySlice[];
  skewTerm: SkewSlice[];
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(expiries, skewTerm), `${revision}:vol`);
  return (
    <div className="vol-skew-chart">
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

function build(expiries: ExpirySlice[], skewTerm: SkewSlice[]) {
  const skewByDay = new Map(skewTerm.map((row) => [row.expiry, row]));
  const rows = expiries.slice(0, 12);
  const labels = rows.map((row) => {
    const [, month, day] = row.expiry.split("-");
    return `${month}/${day} · ${fmtTenor(row.days)}`;
  });
  const atm = rows.map((row) => (row.atmIv != null ? row.atmIv * 100 : null));
  const rr = rows.map((row) => {
    const hit = skewByDay.get(row.expiry);
    return hit ? hit.rr * 100 : null;
  });

  return {
    traces: [
      {
        type: "scatter",
        mode: "lines+markers",
        x: labels,
        y: atm,
        name: "ATM IV",
        line: { color: IV, width: 1.6 },
        marker: { size: 5, color: IV },
        connectgaps: false,
        hovertemplate: "%{x}<br>ATM IV %{y:.1f}%<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        x: labels,
        y: rr,
        yaxis: "y2",
        name: "25Δ RR",
        line: { color: RR, width: 1.4 },
        marker: { size: 5, color: RR },
        connectgaps: false,
        hovertemplate: "%{x}<br>RR %{y:+.1f} vol pts<extra></extra>",
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
        tickformat: ".1f",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 8, color: IV },
        title: { text: "ATM IV %", font: { size: 9, color: IV } },
      },
      yaxis2: {
        overlaying: "y",
        side: "right",
        tickformat: "+.1f",
        showgrid: false,
        zeroline: true,
        zerolinecolor: NOTE,
        tickfont: { size: 8, color: RR },
        title: { text: "25Δ RR", font: { size: 9, color: RR } },
      },
      margin: { l: 44, r: 48, t: 24, b: 36 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: true,
      legend: { orientation: "h", y: 1.15, x: 0, font: { size: 9, color: INK } },
      hovermode: "x unified",
      uirevision: "vol-skew",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 11 },
        align: "left",
      },
    },
  };
}
