// ============================================================
// Forward Gamma Surface — 未来价格路径上的 Gamma Exposure
// ============================================================

import { blackScholes } from "./blackScholes";
import { NormalizedOption } from "../types";

export interface GammaZone {
  startStrike: number;
  endStrike: number;
  peakStrike: number;
  peakGEX: number;
}

export interface GammaSurfacePoint {
  spot: number;
  positiveZone: GammaZone | null;
  negativeZone: GammaZone | null;
  maxPositiveStrike: number;
  maxPositiveGEX: number;
  maxNegativeStrike: number;
  maxNegativeGEX: number;
  totalNetGEX: number;
}

/**
 * 构建 Forward Gamma Surface
 * 对 SpotGrid 中每个价格，用 BS 重算所有期权的 Gamma，聚合成 GEX 分布
 */
export function computeGammaSurface(
  options: NormalizedOption[],
  currentSpot: number,
  resolution: number = 500,
): GammaSurfacePoint[] {
  if (options.length === 0) return [];

  const spotMin = Math.floor((currentSpot * 0.5) / resolution) * resolution;
  const spotMax = Math.ceil((currentSpot * 1.5) / resolution) * resolution;

  const surface: GammaSurfacePoint[] = [];

  for (let spot = spotMin; spot <= spotMax; spot += resolution) {
    // 对每个行权价聚合计 GEX
    const strikeGex = new Map<number, number>();

    for (const opt of options) {
      const T = Math.max(opt.daysToExpiry / 365, 1 / 365);
      const sigma = opt.impliedVolatility;
      const K = opt.strike;

      if (sigma <= 0 || K <= 0 || opt.openInterest <= 0) continue;

      const greeks = blackScholes({
        S: spot,
        K,
        T,
        r: 0, // 无风险利率固定为 0
        sigma,
        optionType: opt.optionType,
      });

      const gamma = greeks.gamma;
      const oi = opt.openInterest;
      const gex = gamma * oi * spot * spot;

      const net = opt.optionType === "call" ? gex : -gex;
      strikeGex.set(K, (strikeGex.get(K) || 0) + net);
    }

    // 找最大正 / 最大负
    let maxPosStrike = 0,
      maxPosGex = -Infinity;
    let maxNegStrike = 0,
      maxNegGex = Infinity;
    let totalNet = 0;

    for (const [strike, gex] of strikeGex) {
      totalNet += gex;
      if (gex > maxPosGex) {
        maxPosGex = gex;
        maxPosStrike = strike;
      }
      if (gex < maxNegGex) {
        maxNegGex = gex;
        maxNegStrike = strike;
      }
    }

    // 正 Gamma 区间: NetGEX > 0 且 > 0.6 × MaxPositive
    const posThreshold = maxPosGex > 0 ? maxPosGex * 0.6 : 0;
    const posStrikes = [...strikeGex.entries()]
      .filter(([_, gex]) => gex > 0 && gex >= posThreshold)
      .sort((a, b) => a[0] - b[0]);

    let positiveZone: GammaZone | null = null;
    if (posStrikes.length > 0) {
      const gapThreshold = spot * 0.02; // 2% 间距视为连续
      let bestStart = posStrikes[0][0],
        bestEnd = posStrikes[0][0];
      let curStart = posStrikes[0][0];

      for (let i = 1; i < posStrikes.length; i++) {
        if (posStrikes[i][0] - posStrikes[i - 1][0] > gapThreshold) {
          curStart = posStrikes[i][0];
        }
        const span = posStrikes[i][0] - curStart;
        if (span > bestEnd - bestStart) {
          bestStart = curStart;
          bestEnd = posStrikes[i][0];
        }
      }
      positiveZone = {
        startStrike: bestStart,
        endStrike: bestEnd,
        peakStrike: maxPosStrike,
        peakGEX: maxPosGex,
      };
    }

    // 负 Gamma 区间: NetGEX < 0 且 |NetGEX| > 0.6 × |MaxNegative|
    const negThreshold = maxNegGex < 0 ? Math.abs(maxNegGex) * 0.6 : 0;
    const negStrikes = [...strikeGex.entries()]
      .filter(([_, gex]) => gex < 0 && Math.abs(gex) >= negThreshold)
      .sort((a, b) => a[0] - b[0]);

    let negativeZone: GammaZone | null = null;
    if (negStrikes.length > 0) {
      const gapThreshold = spot * 0.02;
      let bestStart = negStrikes[0][0],
        bestEnd = negStrikes[0][0];
      let curStart = negStrikes[0][0];

      for (let i = 1; i < negStrikes.length; i++) {
        if (negStrikes[i][0] - negStrikes[i - 1][0] > gapThreshold) {
          curStart = negStrikes[i][0];
        }
        const span = negStrikes[i][0] - curStart;
        if (span > bestEnd - bestStart) {
          bestStart = curStart;
          bestEnd = negStrikes[i][0];
        }
      }
      negativeZone = {
        startStrike: bestStart,
        endStrike: bestEnd,
        peakStrike: maxNegStrike,
        peakGEX: maxNegGex,
      };
    }

    surface.push({
      spot,
      positiveZone,
      negativeZone,
      maxPositiveStrike: maxPosStrike,
      maxPositiveGEX: maxPosGex,
      maxNegativeStrike: maxNegStrike,
      maxNegativeGEX: maxNegGex,
      totalNetGEX: totalNet,
    });
  }

  return surface;
}

/**
 * 从完整 Surface 中提取预测值
 * S = 跨所有 Spot 的最大 positiveGEX 对应的 strike（真正引力中心）
 * V = 跨所有 Spot 的最小（最负）negativeGEX 对应的 strike（最强波动放大器）
 * F = TotalNetGEX(Spot) = 0 的 Spot 价格（市场净伽马翻转点）
 */
export function getPredictedZones(surface: GammaSurfacePoint[]) {
  let bestPos: GammaSurfacePoint = surface[0];
  let bestNeg: GammaSurfacePoint = surface[0];

  for (const p of surface) {
    if (p.maxPositiveGEX > bestPos.maxPositiveGEX) bestPos = p;
    if (p.maxNegativeGEX < bestNeg.maxNegativeGEX) bestNeg = p;
  }

  // Flip Point: TotalNetGEX 在 SpotGrid 上穿过 0 的位置
  let predictedFlipPoint: number | null = null;
  for (let i = 1; i < surface.length; i++) {
    const prev = surface[i - 1].totalNetGEX;
    const curr = surface[i].totalNetGEX;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      // 线性插值
      const t = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
      predictedFlipPoint =
        surface[i - 1].spot + (surface[i].spot - surface[i - 1].spot) * t;
      break;
    }
  }

  return {
    predictedMaxPositiveStrike: bestPos.maxPositiveStrike,
    predictedMaxPositiveGEX: bestPos.maxPositiveGEX,
    predictedMaxNegativeStrike: bestNeg.maxNegativeStrike,
    predictedMaxNegativeGEX: bestNeg.maxNegativeGEX,
    positiveZone: bestPos.positiveZone,
    negativeZone: bestNeg.negativeZone,
    totalNetGEX: bestPos.totalNetGEX,
    bestPositiveSpot: bestPos.spot,
    bestNegativeSpot: bestNeg.spot,
    predictedFlipPoint,
    surface,
  };
}
