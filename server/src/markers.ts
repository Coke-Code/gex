// 价位图上的标注，按 gammaflip 的定义。
// P/N/A 是行权价上的峰。F/S/V/GC 在“现货挪到这里，净 GEX 会变成多少”的曲线上。

import { ChartMarker, GammaCurvePoint, MarkerKind, StrikeGex } from "./types";

const NEAR = 0.005;
const CLIFF = 0.04;

type Row = Pick<StrikeGex, "strike" | "netGex" | "absGex">;

export function chartMarkers(
  strikes: Row[],
  curve: GammaCurvePoint[],
  flipPoint: number | null,
  spot: number,
): ChartMarker[] {
  const markers: ChartMarker[] = [];
  const pushPeaks = (kind: "P" | "N" | "A", read: (row: Row) => number) => {
    pickPeaks(strikes, read, spot).forEach((row, index) => {
      markers.push({ id: `${kind}${index + 1}`, kind, price: row.strike, confluence: false });
    });
  };
  pushPeaks("P", (row) => row.netGex);
  pushPeaks("N", (row) => -row.netGex);
  pushPeaks("A", (row) => row.absGex);

  const add = (id: string, kind: MarkerKind, price: number | null) => {
    if (price == null || !(price > 0)) return;
    markers.push({ id, kind, price, confluence: false });
  };
  add("F", "F", flipPoint);
  add("S", "S", extremum(curve, "max", spot));
  add("V", "V", extremum(curve, "min", spot));
  add("GC", "GC", gammaCliff(curve));

  const radius = spot > 0 ? spot * NEAR : 0;
  for (const marker of markers) {
    marker.confluence = markers.some(
      (other) =>
        other.kind !== marker.kind && Math.abs(other.price - marker.price) <= radius,
    );
  }
  return markers;
}

/** 先取局部峰，不够两个再用次大的柱补上。读数要换成“越大越该标”的方向。 */
function pickPeaks(rows: Row[], read: (row: Row) => number, spot: number): Row[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  const local: Row[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const value = read(sorted[i]);
    if (!(value > 0)) continue;
    const left = i > 0 ? read(sorted[i - 1]) : Number.NEGATIVE_INFINITY;
    const right = i < sorted.length - 1 ? read(sorted[i + 1]) : Number.NEGATIVE_INFINITY;
    if (value >= left && value >= right) local.push(sorted[i]);
  }
  const byRank = (a: Row, b: Row) => {
    const diff = read(b) - read(a);
    if (diff !== 0) return diff;
    return Math.abs(a.strike - spot) - Math.abs(b.strike - spot);
  };
  local.sort(byRank);
  const chosen = local.slice(0, 2);
  if (chosen.length < 2) {
    const rest = sorted.filter((row) => read(row) > 0 && !chosen.includes(row)).sort(byRank);
    chosen.push(...rest.slice(0, 2 - chosen.length));
  }
  return chosen;
}

/** 曲线内部的正峰或负谷。贴着网格两端的不算，那只是窗口边。 */
function extremum(
  curve: GammaCurvePoint[],
  which: "max" | "min",
  spot: number,
): number | null {
  let bestSpot = Number.NaN;
  let bestGex = which === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 1; i < curve.length - 1; i++) {
    const gex = curve[i].totalNetGex;
    const peaked =
      which === "max"
        ? gex > 0 && gex >= curve[i - 1].totalNetGex && gex >= curve[i + 1].totalNetGex
        : gex < 0 && gex <= curve[i - 1].totalNetGex && gex <= curve[i + 1].totalNetGex;
    if (!peaked) continue;
    const better = which === "max" ? gex > bestGex : gex < bestGex;
    const dist = Math.abs(curve[i].spot - spot);
    if (better || (gex === bestGex && dist < bestDist)) {
      bestGex = gex;
      bestSpot = curve[i].spot;
      bestDist = dist;
    }
  }
  return Number.isFinite(bestSpot) ? bestSpot : null;
}

/**
 * 预测曲线上最陡的一步。步长都是现货的 0.5%，所以比的是这一步的 GEX 变化。
 * 变化不到整段曲线落差的 4%，就不当悬崖。
 */
function gammaCliff(curve: GammaCurvePoint[]): number | null {
  if (curve.length < 2) return null;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const point of curve) {
    lo = Math.min(lo, point.totalNetGex);
    hi = Math.max(hi, point.totalNetGex);
  }
  const span = hi - lo;
  if (!(span > 0)) return null;
  let best = 0;
  let at = Number.NaN;
  for (let i = 1; i < curve.length; i++) {
    const delta = curve[i].totalNetGex - curve[i - 1].totalNetGex;
    if (Math.abs(delta) < span * CLIFF) continue;
    if (Math.abs(delta) > Math.abs(best)) {
      best = delta;
      at = (curve[i].spot + curve[i - 1].spot) / 2;
    }
  }
  return Number.isFinite(at) ? at : null;
}
