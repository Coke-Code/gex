import { ExchangeAdapter, NormalizedOption, ExchangeSource } from "../types";
export declare class DeribitAdapter implements ExchangeAdapter {
    name: ExchangeSource;
    private request;
    healthCheck(): Promise<boolean>;
    fetchUnderlyingPrice(underlying: string): Promise<number>;
    fetchOptions(underlying: string): Promise<NormalizedOption[]>;
}
//# sourceMappingURL=deribit.d.ts.map