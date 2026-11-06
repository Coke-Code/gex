import { GammaCurvePoint } from "../types";
import { AXIS, FLIP, GRID, HOVER_BG, HOVER_BORDER, INK, LABEL_BG, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

export default function SpeedChart({
  curve,
  price,
  flip,
  revision,
}: {
  curve: GammaCurvePoint[];
  price: number;
  flip: number | null;
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(curve, price, flip), `${revision}:scale`);
  return <PlotFrame plotRef={ref} onReset={reset} />;
}

function build(curve: GammaCurvePoint[], price: number, flip: number | null) {
  const lo = Math.min(price * 0.88, flip ?? price) * 0.995;
  const hi = Math.max(price * 1.12, flip ?? price) * 1.005;
  const rows = curve.filter((point) => point.spot >= lo && point.spot <= hi);
  return {
    traces: [
      {
        type: "scatter",
        mode: "lines",
        x: rows.map((point) => point.spot),
        y: rows.map((point) => point.totalNetGex),
        customdata: rows.map((point) => [-point.totalNetGex]),
        line: { color: INK, width: 2 },
        hovertemplate:
          "现货若到 %{x:,.0f}<br>涨 1% 对冲 %{y:.3s}<br>跌 1% 对冲 %{customdata[0]:.3s}<extra></extra>",
      },
    ],
    layout: {
      xaxis: {
        range: [lo, hi],
        gridcolor: GRID,
        tickfont: { size: 10, color: AXIS },
        tickformat: ",.0f",
      },
      yaxis: {
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        tickfont: { size: 10, color: AXIS },
        fixedrange: true,
      },
      shapes: [
        {
          type: "line",
          x0: price,
          x1: price,
          y0: 0,
          y1: 1,
          yref: "paper",
          line: { color: INK, width: 1.3, dash: "dash" },
        },
        ...(flip == null
          ? []
          : [
              {
                type: "line",
                x0: flip,
                x1: flip,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: FLIP, width: 1.3 },
              },
            ]),
      ],
      annotations: [
        {
          x: price,
          y: 0.94,
          yref: "paper",
          text: "现货",
          showarrow: false,
          font: { size: 11, color: INK },
          bgcolor: LABEL_BG,
        },
      ],
      margin: { l: 52, r: 12, t: 8, b: 32 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      uirevision: "speed",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
