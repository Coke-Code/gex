import { StrikeGex } from "../types";
import { fmtPx, fmtUsd } from "./format";
import { gexChangeByStrike } from "./gexChangeRows";
import { barColors } from "./barColor";
import { AXIS, GRID, HOVER_BG, HOVER_BORDER, INK, LABEL_BG, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

export default function GexChangeChart({
  strikes,
  price,
  ageHours,
  revision,
}: {
  strikes: StrikeGex[];
  price: number;
  ageHours: number;
  revision: string;
}) {
  const { ref, reset } = usePlot(
    () => build(strikes, price, ageHours),
    `${revision}:change`,
  );
  return (
    <div className="gex-change-chart">
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

function build(strikes: StrikeGex[], price: number, ageHours: number) {
  const items = gexChangeByStrike(strikes, price);
  const x = items.map((item) => item.row.strike);
  const delta = items.map((item) => item.delta);
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
        y: delta,
        width,
        marker: { color: barColors(delta), line: { width: 0 } },
        customdata: items.map(({ row, delta: d }) => {
          const then = row.netThen as number;
          return [
            fmtPx(row.strike),
            fmtUsd(Math.abs(then)),
            fmtUsd(Math.abs(row.netGex)),
            d >= 0 ? "+" : "−",
            fmtUsd(Math.abs(d)),
            ageHours,
          ];
        }),
        hovertemplate:
          "行权 %{customdata[0]}<br>基准 %{customdata[1]}<br>现在 %{customdata[2]}<br>变动 %{customdata[3]}%{customdata[4]}<extra></extra>",
      },
    ],
    layout: {
      xaxis: {
        range: [lo, hi],
        tickformat: ",.0f",
        gridcolor: GRID,
        tickfont: { size: 9, color: AXIS },
        title: { text: "行权价", font: { size: 10, color: AXIS } },
        fixedrange: false,
      },
      yaxis: {
        tickformat: ".2s",
        gridcolor: GRID,
        zeroline: true,
        zerolinecolor: ZERO,
        zerolinewidth: 1.2,
        tickfont: { size: 9, color: AXIS },
        title: { text: "Δ 净 GEX", font: { size: 10, color: AXIS } },
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
          line: { color: INK, width: 1.2, dash: "dash" },
        },
      ],
      annotations: [
        {
          x: price,
          y: 1,
          xref: "x",
          yref: "paper",
          yanchor: "top",
          yshift: -3,
          text: fmtPx(price),
          showarrow: false,
          font: { size: 10, color: INK },
          bgcolor: LABEL_BG,
          bordercolor: INK,
          borderwidth: 1,
          borderpad: 3,
          cliponaxis: false,
        },
      ],
      margin: { l: 52, r: 8, t: 14, b: 36 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      hovermode: "closest",
      bargap: 0.08,
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
