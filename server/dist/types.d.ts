/** 期权类型 */
export type OptionType = "call" | "put";
/** 交易所来源 */
export type ExchangeSource = "deribit" | "okx" | "bybit" | "binance";
/** 原始期权合约数据（各交易所归一化后） */
export interface NormalizedOption {
    exchange: ExchangeSource;
    symbol: string;
    underlying: string;
    optionType: OptionType;
    strike: number;
    expiryDate: string;
    daysToExpiry: number;
    markPrice: number;
    underlyingPrice: number;
    openInterest: number;
    volume24h: number;
    impliedVolatility: number;
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
}
/** 单个行权价的聚合 GEX */
export interface StrikeGex {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    absGex: number;
    breakdown: {
        [exchange in ExchangeSource]?: {
            callGex: number;
            putGex: number;
            oi: number;
        };
    };
}
/** GEX 分析结果 */
export interface GexAnalysis {
    underlying: string;
    underlyingPrice: number;
    timestamp: number;
    strikes: StrikeGex[];
    totalNetGex: number;
    totalAbsGex: number;
    flipPoint: number | null;
    flipZone: {
        low: number;
        high: number;
    } | null;
    hedgingPressure: "positive" | "negative" | "neutral";
    gexPer1PctMove: number;
    exchangeBreakdown: {
        [key in ExchangeSource]?: {
            totalNetGex: number;
            optionCount: number;
            totalOI: number;
        };
    };
}
/** API 响应格式 */
export interface GexResponse {
    success: boolean;
    data: GexAnalysis;
    exchanges: ExchangeSource[];
    errors?: {
        exchange: string;
        message: string;
    }[];
}
/** 交易所接口规范 */
export interface ExchangeAdapter {
    name: ExchangeSource;
    /** 获取所有期权合约 */
    fetchOptions(underlying: string): Promise<NormalizedOption[]>;
    /** 获取标的价格 */
    fetchUnderlyingPrice(underlying: string): Promise<number>;
    /** 检查可用性 */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=types.d.ts.map