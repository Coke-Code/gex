import { HistorySnap } from "../types";

export interface HistoryHeatmapModel {
  times: Date[];
  strikes: number[];
  z: (number | null)[][];
  prices: number[];
  spanLabel: string;
}

export function buildHistoryHeatmap(
  points: HistorySnap[],
  options?: { maxTimes?: number; span?: number; maxStrikes?: number },
): HistoryHeatmapModel | null {
  const maxTimes = options?.maxTimes ?? 120;
  const span = options?.span ?? 0.25;
  const maxStrikes = options?.maxStrikes ?? 96;
  const rows = points.slice(-maxTimes);
  if (rows.length < 2) return null;

  const prices = rows.map((row) => row.underlyingPrice);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sortedPrices.length / 2);
  const anchor =
    sortedPrices.length % 2 === 0
      ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
      : sortedPrices[mid];
  const lo = anchor * (1 - span);
  const hi = anchor * (1 + span);

  const strikeSet = new Set<number>();
  for (const row of rows) {
    const rowLo = row.underlyingPrice * (1 - span);
    const rowHi = row.underlyingPrice * (1 + span);
    for (const strike of row.strikes) {
      if (strike.strike >= rowLo && strike.strike <= rowHi) {
        strikeSet.add(strike.strike);
      }
    }
  }

  let strikes = [...strikeSet].filter((strike) => strike >= lo && strike <= hi).sort((a, b) => a - b);
  if (strikes.length > maxStrikes) {
    const stride = Math.ceil(strikes.length / maxStrikes);
    strikes = strikes.filter((_, index) => index % stride === 0);
  }
  if (strikes.length === 0) return null;

  const strikeLookup = rows.map((row) => new Map(row.strikes.map((item) => [item.strike, item.netGex])));
  const z = strikes.map((strike) =>
    strikeLookup.map((map) => (map.has(strike) ? (map.get(strike) as number) : null)),
  );

  return {
    times: rows.map((row) => new Date(row.timestamp)),
    strikes,
    z,
    prices,
    spanLabel: `±${Math.round(span * 100)}%`,
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
