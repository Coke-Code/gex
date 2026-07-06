// ============================================================
// Black-Scholes 期权定价与 Greeks 计算
// ============================================================

/**
 * 标准正态分布 CDF (累积分布函数)
 * 使用 Abramowitz & Stegun 近似
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/** 标准正态分布 PDF */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface BSParams {
  S: number; // 标的价格
  K: number; // 行权价
  T: number; // 到期时间（年）
  r: number; // 无风险利率
  sigma: number; // 隐含波动率
  optionType: "call" | "put";
}

/**
 * Black-Scholes 定价 + 全部 Greeks
 */
export function blackScholes(params: BSParams): GreeksResult {
  const { S, K, T, r, sigma, optionType } = params;

  // 处理边界情况
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { price: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1 = normalPDF(d1);
  const discount = Math.exp(-r * T);

  let price: number;
  let delta: number;

  if (optionType === "call") {
    price = S * normalCDF(d1) - K * discount * normalCDF(d2);
    delta = normalCDF(d1);
  } else {
    price = K * discount * normalCDF(-d2) - S * normalCDF(-d1);
    delta = normalCDF(d1) - 1;
  }

  // Gamma 对 call 和 put 相同
  const gamma = nd1 / (S * sigma * sqrtT);

  // Vega: 波动率变化1%对应的价格变化（除以100是为了标准化）
  const vega = (S * nd1 * sqrtT) / 100;

  // Theta: 每天的时间衰减
  const thetaCall =
    (-S * nd1 * sigma) / (2 * sqrtT) - r * K * discount * normalCDF(d2);
  const thetaPut =
    (-S * nd1 * sigma) / (2 * sqrtT) + r * K * discount * normalCDF(-d2);
  const theta = (optionType === "call" ? thetaCall : thetaPut) / 365;

  // Rho: 利率变化1%对应的价格变化
  const rho =
    optionType === "call"
      ? (K * T * discount * normalCDF(d2)) / 100
      : (-K * T * discount * normalCDF(-d2)) / 100;

  return { price, delta, gamma, vega, theta, rho };
}

/**
 * 从市场 IV 反推 Greeks（已有 IV 时直接计算）
 */
export function computeGreeksFromIV(
  underlyingPrice: number,
  strike: number,
  daysToExpiry: number,
  iv: number,
  optionType: "call" | "put",
  riskFreeRate: number = 0.05,
): GreeksResult {
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
export function computeGEX(
  gamma: number,
  openInterest: number,
  strike: number,
  multiplier: number = 1, // BTC 通常为1
  underlyingPrice: number,
): number {
  // 使用 gamma 绝对值计算 GEX 大小，符号由调用方按 optionType 处理
  // GEX = |Gamma| × OI × S² × 0.01 (美元/1%移动)
  const absGamma = Math.abs(gamma);
  return (
    absGamma *
    openInterest *
    underlyingPrice *
    underlyingPrice *
    0.01 *
    multiplier
  );
}
