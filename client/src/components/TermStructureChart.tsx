import { TermStructureSlice } from "../types";
import { fmtPx } from "./format";
import { AXIS, FLIP, GRID, HOVER_BG, HOVER_BORDER, INK, NOTE } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const GREEN = "#1B8F4E";
const RED = "#D64550";
const POS_FILL = "rgba(27, 143, 78, 0.32)";
const NEG_FILL = "rgba(214, 69, 80, 0.28)";
const LINE = { shape: "linear" as const };

export default function TermStructureChart({
  slices,
  price,
  revision,
}: {
  slices: TermStructureSlice[];
  price: number;
  revision: string;
}) {
  const { ref, reset } = usePlot(() => build(slices, price), `${revision}:term`);
  return (
    <div className="term-structure-chart">
      <PlotFrame plotRef={ref} onReset={reset} />
    </div>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function expiryLabel(expiry: string): string {
  if (expiry === "TOTAL") return "TOTAL";
  const [year, month, day] = expiry.split("-").map(Number);
  return `${String(day).padStart(2, "0")}${MONTHS[month - 1]}${String(year).slice(2)}`;
}

function markerPrice(slice: TermStructureSlice, id: string): number | null {
  return slice.markers.find((marker) => marker.id === id)?.price ?? null;
}

function band(
  slice: TermStructureSlice,
  a: string,
  b: string,
): [number | null, number | null] {
  const one = markerPrice(slice, a);
  const two = markerPrice(slice, b);
  if (one == null && two == null) return [null, null];
  if (one == null || two == null) return [one ?? two, one ?? two];
  return one <= two ? [one, two] : [two, one];
}

function build(slices: TermStructureSlice[], price: number) {
  const labels = slices.map((slice) => expiryLabel(slice.expiry));
  const pLo = slices.map((slice) => band(slice, "P1", "P2")[0]);
  const pHi = slices.map((slice) => band(slice, "P1", "P2")[1]);
  const nLo = slices.map((slice) => band(slice, "N1", "N2")[0]);
  const nHi = slices.map((slice) => band(slice, "N1", "N2")[1]);
  const flips = slices.map(
    (slice) => slice.flipPoint ?? markerPrice(slice, "F") ?? null,
  );

  const traces: object[] = [];

  traces.push({
    type: "scatter",
    mode: "lines",
    x: labels,
    y: pLo,
    line: { color: GREEN, width: 1.4, ...LINE },
    connectgaps: true,
    hoverinfo: "skip",
  });
  traces.push({
    type: "scatter",
    mode: "lines",
    x: labels,
    y: pHi,
    line: { color: GREEN, width: 1.4, ...LINE },
    fill: "tonexty",
    fillcolor: POS_FILL,
    connectgaps: true,
    customdata: pHi.map((value, index) =>
      value == null
        ? ""
        : `${labels[index]}<br>正峰 ${fmtPx(pLo[index] ?? value)} – ${fmtPx(value)}`,
    ),
    hovertemplate: "%{customdata}<extra></extra>",
  });

  traces.push({
    type: "scatter",
    mode: "lines",
    x: labels,
    y: nLo,
    line: { color: RED, width: 1.4, ...LINE },
    connectgaps: true,
    hoverinfo: "skip",
  });
  traces.push({
    type: "scatter",
    mode: "lines",
    x: labels,
    y: nHi,
    line: { color: RED, width: 1.4, ...LINE },
    fill: "tonexty",
    fillcolor: NEG_FILL,
    connectgaps: true,
    customdata: nHi.map((value, index) =>
      value == null
        ? ""
        : `${labels[index]}<br>负峰 ${fmtPx(nLo[index] ?? value)} – ${fmtPx(value)}`,
    ),
    hovertemplate: "%{customdata}<extra></extra>",
  });

  traces.push({
    type: "scatter",
    mode: "lines+markers",
    x: labels,
    y: flips,
    line: { color: FLIP, width: 2, ...LINE },
    marker: { size: 7, color: FLIP, symbol: "circle" },
    connectgaps: true,
    customdata: flips.map((value, index) =>
      value == null
        ? ""
        : `${labels[index]}<br>Flip ${fmtPx(value)}<br>${slices[index].contractsUsed} 张${slices[index].qualityNote ? `<br>${slices[index].qualityNote}` : ""}`,
    ),
    hovertemplate: "%{customdata}<extra></extra>",
  });

  const yVals = [...pLo, ...pHi, ...nLo, ...nHi, ...flips, price].filter(
    (value): value is number => value != null && value > 0,
  );
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  let yLo = Math.max(1, yMin * 0.94);
  let yHi = yMax * 1.06;
  if (yHi <= yLo) yHi = yLo * 1.04;
  const yRange: [number, number] = [yLo, yHi];

  return {
    traces,
    layout: {
      xaxis: {
        type: "category",
        tickfont: { size: 9, color: AXIS },
        gridcolor: GRID,
        title: { text: "Expiry", font: { size: 10, color: AXIS } },
        fixedrange: false,
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikecolor: NOTE,
        spikedash: "dot",
        spikethickness: 1,
      },
      yaxis: {
        range: yRange,
        tickformat: ",.0f",
        gridcolor: GRID,
        tickfont: { size: 9, color: AXIS },
        title: { text: "Price", font: { size: 10, color: AXIS } },
        fixedrange: true,
      },
      shapes: [
        {
          type: "line",
          x0: 0,
          x1: 1,
          xref: "paper",
          y0: price,
          y1: price,
          line: { color: INK, width: 1.2, dash: "dot" },
        },
      ],
      annotations: [
        {
          x: 1,
          xref: "paper",
          xanchor: "right",
          y: price,
          text: fmtPx(price),
          showarrow: false,
          font: { size: 10, color: NOTE },
        },
      ],
      margin: { l: 56, r: 44, t: 8, b: 40 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      hovermode: "x unified",
      hoverdistance: 24,
      spikedistance: -1,
      uirevision: "term-structure-bands",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
