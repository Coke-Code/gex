// 核心数据类型

export type OptionType = "call" | "put";

export type ExchangeSource = "deribit" | "binance" | "okx";

export type VenueFilter = "all" | ExchangeSource;

/** 归一化后的期权。gamma 不在这里算，避免和交易所希腊字母单位混用。 */
export interface NormalizedOption {
  exchange: ExchangeSource;
  symbol: string;
  underlying: string;
  optionType: OptionType;
  strike: number;
  /** 到期时间，Unix 毫秒 */
  expiryTimestamp: number;
  /** 该到期日的远期，来自 Deribit underlying_price。不是现货指数。 */
  forwardPrice: number;
  /** 权利金，Deribit 反向期权以币计价 */
  markPrice: number;
  /** 未平仓，单位是币（BTC），不是张数再乘合约面值 */
  openInterest: number;
  /** 24 小时成交，单位是币。null 表示这个来源没给成交量 */
  volume24h: number | null;
  /** 小数，0.55 表示 55% */
  impliedVolatility: number;
}

export interface StrikeExpiry {
  /** UTC 日期 YYYY-MM-DD */
  expiry: string;
  days: number;
  netGex: number;
}

export interface StrikeGex {
  strike: number;
  /** Call 侧美元 GEX，为正 */
  callGex: number;
  /** Put 侧美元 GEX 的绝对值，为正 */
  putGex: number;
  /** callGex - putGex */
  netGex: number;
  absGex: number;
  /** 未平仓，币 */
  oi: number;
  /** 24 小时成交，币。null 表示没有任何来源报告成交 */
  volume: number | null;
  /** 有的来源报了成交，有的没有，volume 只是报了的那部分 */
  volumePartial: boolean;
  /** 这一档按到期拆开，从近到远 */
  byExpiry: StrikeExpiry[];
  /** 对比快照上的净 GEX。null 表示那时没有这一档，或还没有快照 */
  netThen: number | null;
  breakdown: Partial<
    Record<ExchangeSource, { callGex: number; putGex: number; oi: number }>
  >;
}

export interface ExpirySlice {
  /** UTC 日期 YYYY-MM-DD */
  expiry: string;
  expiryTimestamp: number;
  days: number;
  netGex: number;
  absGex: number;
  /** 平值隐含波动率，小数 */
  atmIv: number | null;
}

export interface PriceLevel {
  strike: number;
  netGex: number;
}

export interface VenueStatus {
  venue: ExchangeSource;
  online: boolean;
  error: string | null;
  /** 这次请求是否把该所算进图里 */
  included: boolean;
  contractsUsed: number;
  netGex: number;
  absGex: number;
  /** 只用该所持仓算出的翻转。没有则为 null */
  flipPoint: number | null;
}

export interface GammaCurvePoint {
  spot: number;
  totalNetGex: number;
}

/** 图上的标注。P/N/A 在行权价柱上，F/S/V/GC 在预测曲线上。 */
export type MarkerKind = "P" | "N" | "A" | "F" | "S" | "V" | "GC";

export interface ChartMarker {
  id: string;
  kind: MarkerKind;
  price: number;
  /** 附近还有另一类标点 */
  confluence: boolean;
}

export interface DataQuality {
  model: "black76";
  signConvention: "dealer-long-calls-short-puts";
  unit: "usd-per-1pct";
  yearBasis: 365;
  /** Deribit 公开未平仓约有数小时延迟，IV 与远期是实时标记 */
  openInterest: "delayed";
  contractsSeen: number;
  contractsUsed: number;
  contractsDropped: number;
  dropped: {
    expired: number;
    noOpenInterest: number;
    badIv: number;
    badPrice: number;
  };
}

export interface GexAnalysis {
  underlying: string;
  /** 现货指数 */
  underlyingPrice: number;
  timestamp: number;
  strikes: StrikeGex[];
  /** 当前现货处的净美元 GEX（每 1% 波动） */
  totalNetGex: number;
  totalAbsGex: number;
  /** 现货空间的零 gamma，离现货最近的一次穿越。没有则为 null */
  flipPoint: number | null;
  /** 价位图标注：正负峰、绝对峰、翻转、稳定点、波动点、悬崖 */
  markers: ChartMarker[];
  flipZone: { low: number; high: number } | null;
  /** 由当前净 GEX 的符号决定，不由行权价位置猜测 */
  hedgingPressure: "positive" | "negative" | "neutral";
  /** 与 totalNetGex 相同，保留字段：数值已经是每 1% 的美元量 */
  gexPer1PctMove: number;
  gammaCurve: GammaCurvePoint[];
  /** 价位：支撑是现货下方最负的净 GEX，阻力是现货上方最正的净 GEX */
  levels: {
    support: PriceLevel | null;
    resistance: PriceLevel | null;
  };
  /** 期限：按到期日汇总，从近到远 */
  expiries: ExpirySlice[];
  /** 速度：上涨 1% 的对冲额，以及对冲额本身会再变多少 */
  speed: {
    hedgeUsdPer1Pct: number;
    gexChangePer1Pct: number | null;
  };
  /** 用接近 1 天的平值隐波换算的一日 1σ 价格距离 */
  move: {
    expiry: string;
    days: number;
    iv: number;
    /** 现货 × 隐波 × √(1/365)，单位是美元价格 */
    oneDay: number;
  } | null;
  /** 和一份真实旧快照比。没有足够旧的快照则为 null */
  change: {
    timestamp: number;
    ageHours: number;
    flipPoint: number | null;
    price: number;
  } | null;
  /** 近端 25Δ 偏斜：put IV − call IV。正数表示下跌保险更贵 */
  skew: {
    expiry: string;
    days: number;
    putIv: number;
    callIv: number;
    rr: number;
  } | null;
  venue: VenueFilter;
  venues: VenueStatus[];
  quality: DataQuality;
  exchangeBreakdown: Partial<
    Record<
      ExchangeSource,
      { totalNetGex: number; optionCount: number; totalOI: number }
    >
  >;
}

export interface GexResponse {
  success: boolean;
  data?: GexAnalysis;
  exchanges: ExchangeSource[];
  errors?: { exchange: string; message: string }[];
  error?: string;
}

export interface ExchangeAdapter {
  name: ExchangeSource;
  fetchOptions(underlying: string): Promise<NormalizedOption[]>;
  fetchUnderlyingPrice(underlying: string): Promise<number>;
  healthCheck(): Promise<boolean>;
}
