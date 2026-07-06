import { ExchangeAdapter, NormalizedOption, ExchangeSource } from "../types";
export declare class BinanceAdapter implements ExchangeAdapter {
    name: ExchangeSource;
    private request;
    healthCheck(): Promise<boolean>;
    fetchUnderlyingPrice(underlying: string): Promise<number>;
    fetchOptions(underlying: string): Promise<NormalizedOption[]>;
}
//# sourceMappingURL=binance.d.ts.map