import { ChartMarker, GammaCurvePoint } from "../types";
import { gexAtSpotOnCurve } from "./format";
import { AXIS, FLIP, GRID, HOVER_BG, HOVER_BORDER, INK, LABEL_BG, NOTE, ZERO } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const CURVE = "#2F6FE0";
const POS_FILL = "rgba(47, 111, 224, 0.22)";
const NEG_FILL = "rgba(120, 48, 48, 0.32)";

export default function SpeedChart({
  curve,
  price,
  flip,
  markers,
  revision,
}: {
  curve: GammaCurvePoint[];
  price: number;
  flip: number | null;
  markers: ChartMarker[];
  revision: string;
}) {
  const { ref, reset } = usePlot(
    () => build(curve, price, flip, markers),
    `${revision}:scale`,
  );
  return <PlotFrame plotRef={ref} onReset={reset} />;
}

function signSegments(rows: GammaCurvePoint[]) {
  const segments: { x: number[]; y: number[]; positive: boolean }[] = [];
  let current: { x: number[]; y: number[]; positive: boolean } | null = null;
  for (const point of rows) {
    const positive = point.totalNetGex >= 0;
    if (!current || current.positive !== positive) {
      if (current && current.x.length > 0) segments.push(current);
      current = { x: [], y: [], positive };
    }
    current.x.push(point.spot);
    current.y.push(point.totalNetGex);
  }
  if (current && current.x.length > 0) segments.push(current);
  return segments;
}

function build(
  curve: GammaCurvePoint[],
  price: number,
  flip: number | null,
  markers: ChartMarker[],
) {
  const lo = Math.min(price * 0.88, flip ?? price) * 0.995;
  const hi = Math.max(price * 1.12, flip ?? price) * 1.005;
  const rows = curve.filter((point) => point.spot >= lo && point.spot <= hi);

  const splineLine = { shape: "spline" as const, smoothing: 1.15 };

  const traces: object[] = signSegments(rows).map((segment) => ({
    type: "scatter",
    mode: "lines",
    x: segment.x,
    y: segment.y,
    fill: "tozeroy",
    fillcolor: segment.positive ? POS_FILL : NEG_FILL,
    line: { width: 0, ...splineLine },
    hoverinfo: "skip",
  }));

  traces.push({
    type: "scatter",
    mode: "lines",
    x: rows.map((point) => point.spot),
    y: rows.map((point) => point.totalNetGex),
    customdata: rows.map((point) => [-point.totalNetGex]),
    line: { color: CURVE, width: 2.2, ...splineLine },
    hovertemplate:
      "现货若到 %{x:,.0f}<br>涨 1% 对冲 %{y:.3s}<br>跌 1% 对冲 %{customdata[0]:.3s}<extra></extra>",
  });

  const shown = markers.filter(
    (marker) =>
      (marker.kind === "F" || marker.kind === "S" || marker.kind === "V") &&
      marker.price >= lo &&
      marker.price <= hi,
  );

  for (const marker of shown) {
    const y =
      marker.kind === "F"
        ? 0
        : (gexAtSpotOnCurve(rows, marker.price) ?? 0);
    const style =
      marker.kind === "S"
        ? { symbol: "circle", color: "#1B8F4E", text: "S" }
        : marker.kind === "V"
          ? { symbol: "circle", color: "#D64550", text: "V" }
          : { symbol: "diamond", color: FLIP, text: "F" };
    traces.push({
      type: "scatter",
      mode: "markers+text",
      x: [marker.price],
      y: [y],
      text: [style.text],
      textposition: marker.kind === "F" ? "middle right" : "top center",
      textfont: { size: 12, color: style.color },
      marker: { symbol: style.symbol, size: marker.kind === "F" ? 11 : 10, color: style.color },
      hoverinfo: "skip",
    });
  }

  const posMid = rows.filter((row) => row.totalNetGex > 0);
  const negMid = rows.filter((row) => row.totalNetGex < 0);
  const annotations: object[] = [
    {
      x: price,
      y: 0.94,
      yref: "paper",
      text: Math.round(price).toLocaleString("en-US"),
      showarrow: false,
      font: { size: 11, color: INK },
      bgcolor: LABEL_BG,
    },
  ];
  if (negMid.length > 0) {
    const mid = negMid[Math.floor(negMid.length / 2)];
    annotations.push({
      x: mid.spot,
      y: mid.totalNetGex,
      text: "Negative · 放大波动",
      showarrow: false,
      yshift: -22,
      font: { size: 10, color: "#8c4040" },
      bgcolor: "rgba(255, 248, 220, 0.92)",
      borderpad: 4,
    });
  }
  if (posMid.length > 0) {
    const mid = posMid[Math.floor(posMid.length / 2)];
    annotations.push({
      x: mid.spot,
      y: mid.totalNetGex,
      text: "Positive · 压制波动",
      showarrow: false,
      yshift: 18,
      font: { size: 10, color: "#1B8F4E" },
      bgcolor: "rgba(255, 248, 220, 0.92)",
      borderpad: 4,
    });
  }

  return {
    traces,
    layout: {
      xaxis: {
        range: [lo, hi],
        gridcolor: GRID,
        tickfont: { size: 10, color: AXIS },
        tickformat: ",.0f",
        title: { text: "Price", font: { size: 10, color: AXIS } },
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikecolor: NOTE,
        spikedash: "dot",
        spikethickness: 1,
      },
      yaxis: {
        tickformat: ".2s",
        gridcolor: GRID,
        zerolinecolor: ZERO,
        zerolinewidth: 1.2,
        tickfont: { size: 10, color: AXIS },
        title: { text: "USD GEX per 1% Move", font: { size: 10, color: AXIS } },
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
      ],
      annotations,
      margin: { l: 58, r: 12, t: 8, b: 36 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      hovermode: "x unified",
      hoverdistance: 24,
      spikedistance: -1,
      uirevision: "speed-forecast-v2",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
