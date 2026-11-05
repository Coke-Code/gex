// Black-76 gamma。Deribit 的 mark IV 标在该到期日的远期上，d1 里不含利率。

const MIN_YEAR_FRACTION = 1 / (365 * 24 * 60);

export const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** 标准正态密度 */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** 标准正态累积，Abramowitz & Stegun 近似 */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/**
 * 剩余期限（ACT/365）。已到期返回 0。
 * 不足 1 分钟时抬到 1 分钟，避免 1/√T 发散；不会把 0DTE 抬成 1 天。
 */
export function yearFraction(expiryMs: number, nowMs: number): number {
  const t = (expiryMs - nowMs) / MS_PER_YEAR;
  if (!(t > 0)) return 0;
  return Math.max(t, MIN_YEAR_FRACTION);
}

/**
 * ∂Δ/∂F。Call 与 Put 相同，单位是「每 1 美元远期变动的 delta」。
 */
export function black76Gamma(
  forward: number,
  strike: number,
  timeYears: number,
  iv: number,
): number {
  if (!(forward > 0) || !(strike > 0) || !(timeYears > 0) || !(iv > 0)) {
    return 0;
  }
  const volSqrt = iv * Math.sqrt(timeYears);
  const d1 = (Math.log(forward / strike) + 0.5 * iv * iv * timeYears) / volSqrt;
  return normalPdf(d1) / (forward * volSqrt);
}

/** 未折现的 Black-76 delta。Call 约在 0 到 1，Put 约在 -1 到 0。 */
export function black76Delta(
  forward: number,
  strike: number,
  timeYears: number,
  iv: number,
  optionType: "call" | "put",
): number {
  if (!(forward > 0) || !(strike > 0) || !(timeYears > 0) || !(iv > 0)) {
    return 0;
  }
  const volSqrt = iv * Math.sqrt(timeYears);
  const d1 = (Math.log(forward / strike) + 0.5 * iv * iv * timeYears) / volSqrt;
  const callDelta = normalCdf(d1);
  return optionType === "call" ? callDelta : callDelta - 1;
}
