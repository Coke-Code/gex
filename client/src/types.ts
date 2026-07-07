// 前端类型定义（与后端 types.ts 对应）

export type OptionType = "call" | "put";
export type ExchangeSource = "deribit";

export interface StrikeGex {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  absGex: number;
  breakdown: {
    deribit?: {
      callGex: number;
      putGex: number;
      oi: number;
    };
  };
}

export interface ExchangeBreakdownEntry {
  totalNetGex: number;
  optionCount: number;
  totalOI: number;
}

export interface GexAnalysis {
  underlying: string;
  underlyingPrice: number;
  timestamp: number;
  strikes: StrikeGex[];
  totalNetGex: number;
  totalAbsGex: number;
  flipPoint: number | null;
  flipZone: { low: number; high: number } | null;
  hedgingPressure: "positive" | "negative" | "neutral";
  gexPer1PctMove: number;
  exchangeBreakdown: {
    deribit?: ExchangeBreakdownEntry;
  };
}

export interface GexResponse {
  success: boolean;
  data: GexAnalysis;
  exchanges: ExchangeSource[];
  errors?: { exchange: string; message: string }[];
}

export interface ExchangeHealth {
  exchange: string;
  online: boolean;
}

/** Forward Gamma Surface 区域 */
export interface GammaZone {
  startStrike: number;
  endStrike: number;
  peakStrike: number;
  peakGEX: number;
}

/** 单个 Spot 节点的 Gamma Surface 数据 */
export interface GammaSurfacePoint {
  spot: number;
  positiveZone: GammaZone | null;
  negativeZone: GammaZone | null;
  maxPositiveStrike: number;
  maxPositiveGEX: number;
  maxNegativeStrike: number;
  maxNegativeGEX: number;
  totalNetGEX: number;
}

/** Forward Gamma 预测结果 */
export interface ForwardGammaResult {
  predictedMaxPositiveStrike: number;
  predictedMaxPositiveGEX: number;
  predictedMaxNegativeStrike: number;
  predictedMaxNegativeGEX: number;
  positiveZone: GammaZone | null;
  negativeZone: GammaZone | null;
  totalNetGEX: number;
  surface: GammaSurfacePoint[];
  underlyingPrice: number;
  bestPositiveSpot: number;
  bestNegativeSpot: number;
  predictedFlipPoint: number | null;
}

export const EXCHANGE_LABELS: Record<ExchangeSource, string> = {
  deribit: "Deribit",
};

export const EXCHANGE_COLORS: Record<ExchangeSource, string> = {
  deribit: "#00D4AA",
};
