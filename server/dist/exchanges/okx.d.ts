import { ExchangeAdapter, NormalizedOption, ExchangeSource } from "../types";
export declare class OkxAdapter implements ExchangeAdapter {
    name: ExchangeSource;
    private request;
    healthCheck(): Promise<boolean>;
    fetchUnderlyingPrice(underlying: string): Promise<number>;
    fetchOptions(underlying: string): Promise<NormalizedOption[]>;
}
//# sourceMappingURL=okx.d.ts.map