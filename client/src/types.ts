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

export const EXCHANGE_LABELS: Record<ExchangeSource, string> = {
  deribit: "Deribit",
};

export const EXCHANGE_COLORS: Record<ExchangeSource, string> = {
  deribit: "#00D4AA",
};
