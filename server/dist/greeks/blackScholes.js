"use strict";
// ============================================================
// Black-Scholes 期权定价与 Greeks 计算
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.blackScholes = blackScholes;
exports.computeGreeksFromIV = computeGreeksFromIV;
exports.computeGEX = computeGEX;
/**
 * 标准正态分布 CDF (累积分布函数)
 * 使用 Abramowitz & Stegun 近似
 */
function normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}
/** 标准正态分布 PDF */
function normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
/**
 * Black-Scholes 定价 + 全部 Greeks
 */
function blackScholes(params) {
    const { S, K, T, r, sigma, optionType } = params;
    // 处理边界情况
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
        return { price: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
    }
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const nd1 = normalPDF(d1);
    const discount = Math.exp(-r * T);
    let price;
    let delta;
    if (optionType === "call") {
        price = S * normalCDF(d1) - K * discount * normalCDF(d2);
        delta = normalCDF(d1);
    }
    else {
        price = K * discount * normalCDF(-d2) - S * normalCDF(-d1);
        delta = normalCDF(d1) - 1;
    }
    // Gamma 对 call 和 put 相同
    const gamma = nd1 / (S * sigma * sqrtT);
    // Vega: 波动率变化1%对应的价格变化（除以100是为了标准化）
    const vega = (S * nd1 * sqrtT) / 100;
    // Theta: 每天的时间衰减
    const thetaCall = (-S * nd1 * sigma) / (2 * sqrtT) - r * K * discount * normalCDF(d2);
    const thetaPut = (-S * nd1 * sigma) / (2 * sqrtT) + r * K * discount * normalCDF(-d2);
    const theta = (optionType === "call" ? thetaCall : thetaPut) / 365;
    // Rho: 利率变化1%对应的价格变化
    const rho = optionType === "call"
        ? (K * T * discount * normalCDF(d2)) / 100
        : (-K * T * discount * normalCDF(-d2)) / 100;
    return { price, delta, gamma, vega, theta, rho };
}
/**
 * 从市场 IV 反推 Greeks（已有 IV 时直接计算）
 */
function computeGreeksFromIV(underlyingPrice, strike, daysToExpiry, iv, optionType, riskFreeRate = 0.05) {
    return blackScholes({
        S: underlyingPrice,
        K: strike,
        T: Math.max(daysToExpiry / 365, 1 / 365), // 最少1天
        r: riskFreeRate,
        sigma: iv,
        optionType,
    });
}
/**
 * 计算 GEX (Gamma Exposure)
 * GEX = Gamma × OpenInterest × 行权价 × 乘数
 * 当 Gamma 以 1% 变化为单位时需 × 0.01
 */
function computeGEX(gamma, openInterest, strike, multiplier = 1, // BTC 通常为1
underlyingPrice) {
    // 标准 GEX 公式: Gamma * OI * S^2 * 0.01 (美元/1%移动)
    // 说明：此前使用 S*100 的简化写法会低估约 S/100 倍（BTC 在 60k 时约 6x）。
    return (gamma *
        openInterest *
        underlyingPrice *
        underlyingPrice *
        0.01 *
        multiplier);
}
//# sourceMappingURL=blackScholes.js.map