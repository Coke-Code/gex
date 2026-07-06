export interface GreeksResult {
    price: number;
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
    rho: number;
}
export interface BSParams {
    S: number;
    K: number;
    T: number;
    r: number;
    sigma: number;
    optionType: "call" | "put";
}
/**
 * Black-Scholes 定价 + 全部 Greeks
 */
export declare function blackScholes(params: BSParams): GreeksResult;
/**
 * 从市场 IV 反推 Greeks（已有 IV 时直接计算）
 */
export declare function computeGreeksFromIV(underlyingPrice: number, strike: number, daysToExpiry: number, iv: number, optionType: "call" | "put", riskFreeRate?: number): GreeksResult;
/**
 * 计算 GEX (Gamma Exposure)
 * GEX = Gamma × OpenInterest × 行权价 × 乘数
 * 当 Gamma 以 1% 变化为单位时需 × 0.01
 */
export declare function computeGEX(gamma: number, openInterest: number, strike: number, multiplier: number | undefined, // BTC 通常为1
underlyingPrice: number): number;
//# sourceMappingURL=blackScholes.d.ts.map