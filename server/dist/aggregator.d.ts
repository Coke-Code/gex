import { GexAnalysis, ExchangeSource, ExchangeAdapter } from "./types";
declare const ALL_EXCHANGES: ExchangeSource[];
/**
 * 从各交易所拉取并聚合数据
 */
export declare function aggregateGex(adapters: ExchangeAdapter[], underlying: string, enabledExchanges?: ExchangeSource[]): Promise<GexAnalysis>;
export { ALL_EXCHANGES };
//# sourceMappingURL=aggregator.d.ts.map