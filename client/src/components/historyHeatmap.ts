import { HistoryHeatmapPayload } from "../types";

export interface HistoryHeatmapModel {
  times: Date[];
  strikes: number[];
  z: (number | null)[][];
  prices: number[];
  flips: (number | null)[];
  spanLabel: string;
}

export function modelFromHistoryPayload(
  payload: HistoryHeatmapPayload,
): HistoryHeatmapModel | null {
  if (payload.t.length < 2 || payload.k.length === 0) return null;
  return {
    times: payload.t.map((ts) => new Date(ts)),
    strikes: payload.k,
    z: payload.z,
    prices: payload.p,
    flips: payload.f,
    spanLabel: `±${Math.round(payload.span * 100)}%`,
  };
}

export function heatmapAbsPeak(z: (number | null)[][]): number {
  let peak = 0;
  for (const row of z) {
    for (const value of row) {
      if (value == null) continue;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  return peak > 0 ? peak : 1;
}

export function heatmapZBounds(z: (number | null)[][]): { zmax: number; zmin: number } {
  const peak = heatmapAbsPeak(z);
  return { zmax: peak, zmin: -peak };
}