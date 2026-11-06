import { TermStructureSlice } from "../types";
import { fmtPx } from "./format";
import { AXIS, FLIP, GRID, HOVER_BG, HOVER_BORDER, INK, NOTE } from "./palette";
import { PlotFrame, usePlot } from "./usePlot.tsx";

const GREEN = "#1B8F4E";
const RED = "#D64550";
const POS_FILL = "rgba(27, 143, 78, 0.32)";
const NEG_FILL = "rgba(214, 69, 80, 0.28)";
const LINE = { shape: "linear" as const };

const PEAK_IDS = ["P1", "P2", "N1", "N2"] as const;

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

function markerSeries(
  slices: TermStructureSlice[],
  id: (typeof PEAK_IDS)[number],
): (number | null)[] {
  return slices.map((slice) => markerPrice(slice, id));
}

function lastExpiryIndex(slices: TermStructureSlice[]): number {
  for (let index = slices.length - 1; index >= 0; index -= 1) {
    if (slices[index].expiry !== "TOTAL") return index;
  }
  return -1;
}

function bandMid(a: number | null, b: number | null): number | null {
  if (a != null && b != null) return (a + b) / 2;
  return a ?? b;
}

/** P1/P2 按强度编号，跨到期直接连线会上下换位；带缘用每列 min/max（同 GammaFlip）。 */
function bandEdges(
  one: (number | null)[],
  two: (number | null)[],
): { lo: (number | null)[]; hi: (number | null)[] } {
  const lo: (number | null)[] = [];
  const hi: (number | null)[] = [];
  for (let index = 0; index < one.length; index += 1) {
    const a = one[index];
    const b = two[index];
    if (a == null && b == null) {
      lo.push(null);
      hi.push(null);
    } else if (a == null || b == null) {
      const only = a ?? b;
      lo.push(only);
      hi.push(only);
    } else {
      lo.push(Math.min(a, b));
      hi.push(Math.max(a, b));
    }
  }
  return { lo, hi };
}

type RegionAnnotation = {
  x: number;
  xref: "paper";
  y: number;
  text: string;
  showarrow: boolean;
  xanchor: "right";
  yanchor: "middle" | "bottom";
  yshift?: number;
  font: { size: number; color: string };
  cliponaxis: boolean;
};

/** 右缘带内文字（GammaFlip 风格），高度取最末到期 P/N 带与 Flip */
function regionLabels(
  slices: TermStructureSlice[],
  posLo: (number | null)[],
  posHi: (number | null)[],
  negLo: (number | null)[],
  negHi: (number | null)[],
  flips: (number | null)[],
): RegionAnnotation[] {
  const index = lastExpiryIndex(slices);
  if (index < 0) return [];

  const base = {
    x: 1,
    xref: "paper" as const,
    showarrow: false,
    xanchor: "right" as const,
    cliponaxis: false,
  };

  const out: RegionAnnotation[] = [];
  const posY = bandMid(posLo[index], posHi[index]);
  if (posY != null) {
    out.push({
      ...base,
      y: posY,
      yanchor: "middle",
      text: "Positive peaks",
      font: { size: 11, color: GREEN },
    });
  }
  const negY = bandMid(negLo[index], negHi[index]);
  if (negY != null) {
    out.push({
      ...base,
      y: negY,
      yanchor: "middle",
      text: "Negative peaks",
      font: { size: 11, color: RED },
    });
  }
  const flipY = flips[index];
  if (flipY != null) {
    out.push({
      ...base,
      y: flipY,
      yanchor: "bottom",
      yshift: 6,
      text: "Gamma Flip",
      font: { size: 11, color: FLIP },
    });
  }
  return out;
}

function pairBandTraces(
  labels: string[],
  lo: (number | null)[],
  hi: (number | null)[],
  lineColor: string,
  fillColor: string,
  bandName: string,
): object[] {
  return [
    {
      type: "scatter",
      mode: "lines",
      x: labels,
      y: lo,
      line: { color: lineColor, width: 1.6, ...LINE },
      connectgaps: true,
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      mode: "lines",
      x: labels,
      y: hi,
      line: { color: lineColor, width: 1.6, ...LINE },
      fill: "tonexty",
      fillcolor: fillColor,
      connectgaps: true,
      customdata: hi.map((value, index) => {
        const low = lo[index];
        if (value == null && low == null) return "";
        return `${labels[index]}<br>${bandName} ${fmtPx(low ?? value ?? 0)} – ${fmtPx(value ?? low ?? 0)}`;
      }),
      hovertemplate: "%{customdata}<extra></extra>",
    },
  ];
}

function build(slices: TermStructureSlice[], price: number) {
  const labels = slices.map((slice) => expiryLabel(slice.expiry));
  const p1 = markerSeries(slices, "P1");
  const p2 = markerSeries(slices, "P2");
  const n1 = markerSeries(slices, "N1");
  const n2 = markerSeries(slices, "N2");
  const pos = bandEdges(p1, p2);
  const neg = bandEdges(n1, n2);
  const flips = slices.map(
    (slice) => markerPrice(slice, "F") ?? slice.flipPoint ?? null,
  );

  const traces: object[] = [
    ...pairBandTraces(labels, pos.lo, pos.hi, GREEN, POS_FILL, "Positive peaks"),
    ...pairBandTraces(labels, neg.lo, neg.hi, RED, NEG_FILL, "Negative peaks"),
    {
      type: "scatter",
      mode: "lines+markers",
      x: labels,
      y: flips,
      line: { color: FLIP, width: 2.2, ...LINE },
      marker: { size: 6, color: FLIP, symbol: "circle" },
      connectgaps: true,
      customdata: flips.map((value, index) =>
        value == null
          ? ""
          : `${labels[index]}<br>Gamma Flip ${fmtPx(value)}<br>${slices[index].contractsUsed} 张${slices[index].qualityNote ? `<br>${slices[index].qualityNote}` : ""}`,
      ),
      hovertemplate: "%{customdata}<extra></extra>",
    },
  ];

  const yVals = [...pos.lo, ...pos.hi, ...neg.lo, ...neg.hi, ...flips, price].filter(
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
        ...(price > 0
          ? [
              {
                x: 0,
                xref: "paper" as const,
                xanchor: "right" as const,
                xshift: -2,
                y: price,
                yanchor: "middle" as const,
                text: fmtPx(price),
                showarrow: false,
                font: { size: 9, color: INK },
                bgcolor: "rgba(255,255,255,0.9)",
                bordercolor: INK,
                borderwidth: 1,
                borderpad: 2,
                cliponaxis: false,
              },
            ]
          : []),
        ...regionLabels(slices, pos.lo, pos.hi, neg.lo, neg.hi, flips),
      ],
      margin: { l: 52, r: 8, t: 8, b: 32 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: false,
      hovermode: "x unified",
      hoverdistance: 24,
      spikedistance: -1,
      uirevision: "term-structure-simple",
      hoverlabel: {
        bgcolor: HOVER_BG,
        bordercolor: HOVER_BORDER,
        font: { color: INK, size: 12 },
        align: "left",
      },
    },
  };
}
