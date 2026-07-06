import { ExchangeAdapter, NormalizedOption, ExchangeSource } from "../types";
export declare class BybitAdapter implements ExchangeAdapter {
    name: ExchangeSource;
    private request;
    healthCheck(): Promise<boolean>;
    fetchUnderlyingPrice(underlying: string): Promise<number>;
    fetchOptions(underlying: string): Promise<NormalizedOption[]>;
}
//# sourceMappingURL=bybit.d.ts.map