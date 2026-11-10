import { HistorySnap } from "../types";

export type HedgingPressure = "positive" | "negative" | "neutral";

/** 与 analyzeChain 顶栏 Regime 相同阈值（|净| > 2% · |总 ABS|） */
export function snapHedgingPressure(row: HistorySnap): HedgingPressure {
  if (row.hedgingPressure) return row.hedgingPressure;
  if (!(row.totalAbsGex > 0)) return "neutral";
  if (row.totalNetGex > row.totalAbsGex * 0.02) return "positive";
  if (row.totalNetGex < -row.totalAbsGex * 0.02) return "negative";
  return "neutral";
}

export const REGIME_BAND_FILL: Record<HedgingPressure, string> = {
  positive: "rgba(47, 125, 82, 0.08)",
  negative: "rgba(184, 90, 69, 0.09)",
  neutral: "rgba(160, 139, 120, 0.07)",
};
