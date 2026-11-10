import { StrikeGex } from "../types";

export function oiNearSpot(strikes: StrikeGex[], price: number, span = 0.25): StrikeGex[] {
  const lo = price * (1 - span);
  const hi = price * (1 + span);
  return strikes
    .filter((row) => row.oi > 0 && row.strike > lo && row.strike < hi)
    .sort((a, b) => a.strike - b.strike);
}

export function oiDelta(row: StrikeGex): number | null {
  if (row.oiThen == null) return null;
  return row.oi - row.oiThen;
}
