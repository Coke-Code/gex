import { StrikeGex } from "../types";

export interface GexChangeRow {
  row: StrikeGex;
  delta: number;
  abs: number;
}

export function gexChangeRows(
  strikes: StrikeGex[],
  price: number,
  span = 0.25,
): GexChangeRow[] {
  const lo = price * (1 - span);
  const hi = price * (1 + span);
  return strikes
    .filter((row) => row.netThen != null)
    .filter((row) => row.strike > lo && row.strike < hi)
    .map((row) => {
      const delta = row.netGex - (row.netThen as number);
      return { row, delta, abs: Math.abs(delta) };
    });
}

export function gexChangeByStrike(strikes: StrikeGex[], price: number): GexChangeRow[] {
  return gexChangeRows(strikes, price).sort((a, b) => a.row.strike - b.row.strike);
}

/** 按 |Δ| 从大到小；limit 省略则返回范围内全部 */
export function gexChangeRanked(
  strikes: StrikeGex[],
  price: number,
  limit?: number,
): GexChangeRow[] {
  const sorted = gexChangeRows(strikes, price).sort((a, b) => b.abs - a.abs);
  return limit == null ? sorted : sorted.slice(0, limit);
}

export function totalNetDelta(rows: GexChangeRow[]): number {
  return rows.reduce((sum, item) => sum + item.delta, 0);
}

export function totalOiDelta(rows: GexChangeRow[]): number | null {
  let sum = 0;
  let seen = false;
  for (const item of rows) {
    if (item.row.oiThen == null) continue;
    sum += item.row.oi - item.row.oiThen;
    seen = true;
  }
  return seen ? sum : null;
}
