// ============================================================
// Deribit 数据聚合器
// ============================================================

import {
  NormalizedOption,
  StrikeGex,
  GexAnalysis,
  ExchangeAdapter,
} from "./types";
import { computeGEX } from "./greeks/blackScholes";

/**
 * 从 Deribit 拉取并聚合数据
 */
export async function aggregateGex(
  adapter: ExchangeAdapter,
  underlying: string,
): Promise<GexAnalysis> {
  // 1. 拉取 Deribit 数据
  const price = await adapter.fetchUnderlyingPrice(underlying);
  const options = await adapter.fetchOptions(underlying);

  // 回填标的价格
  for (const opt of options) {
    if (opt.underlyingPrice === 0) {
      opt.underlyingPrice = price;
    }
  }

  const underlyingPrice = price;

  // 2. 收集汇总
  let totalGex = 0;
  for (const opt of options) {
    const gex = computeGEX(opt.gamma, opt.openInterest, opt.strike, 1, price);
    totalGex += gex * (opt.optionType === "call" ? 1 : -1);
  }

  const exchangeBreakdown: GexAnalysis["exchangeBreakdown"] = {
    deribit: {
      totalNetGex: totalGex,
      optionCount: options.length,
      totalOI: options.reduce((sum, o) => sum + o.openInterest, 0),
    },
  };

  // 3. 按行权价聚合
  const strikeMap = new Map<number, StrikeGex>();

  for (const opt of options) {
    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, {
        strike: opt.strike,
        callGex: 0,
        putGex: 0,
        netGex: 0,
        absGex: 0,
        breakdown: {},
      });
    }

    const entry = strikeMap.get(opt.strike)!;
    const gex = computeGEX(
      opt.gamma,
      opt.openInterest,
      opt.strike,
      1,
      opt.underlyingPrice,
    );

    if (opt.optionType === "call") {
      entry.callGex += gex;
    } else {
      entry.putGex += gex;
    }

    if (!entry.breakdown.deribit) {
      entry.breakdown.deribit = { callGex: 0, putGex: 0, oi: 0 };
    }
    const bd = entry.breakdown.deribit!;
    if (opt.optionType === "call") {
      bd.callGex += gex;
    } else {
      bd.putGex += gex;
    }
    bd.oi += opt.openInterest;
  }

  // 4. 计算每个行权价的 net/abs GEX
  for (const [, entry] of strikeMap) {
    entry.netGex = entry.callGex - entry.putGex;
    entry.absGex = Math.abs(entry.callGex) + Math.abs(entry.putGex);
  }

  // 5. 排序（保留 Deribit 原始 strike 间距，前端根据相邻间距自适应柱宽）
  const strikes = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);

  // 7. 计算汇总指标
  const totalNetGex = strikes.reduce((sum, s) => sum + s.netGex, 0);
  const totalAbsGex = strikes.reduce((sum, s) => sum + s.absGex, 0);

  // 8. Flip Point: Net GEX 由正转负的行权价区间
  let flipPoint: number | null = null;
  let flipZone: { low: number; high: number } | null = null;

  for (let i = 1; i < strikes.length; i++) {
    if (strikes[i - 1].netGex > 0 && strikes[i].netGex < 0) {
      flipPoint = (strikes[i - 1].strike + strikes[i].strike) / 2;
      flipZone = { low: strikes[i - 1].strike, high: strikes[i].strike };
      break;
    }
    if (strikes[i - 1].netGex < 0 && strikes[i].netGex > 0) {
      flipPoint = (strikes[i - 1].strike + strikes[i].strike) / 2;
      flipZone = { low: strikes[i - 1].strike, high: strikes[i].strike };
      break;
    }
  }

  // 9. 对冲压力：当前价格附近的 Gamma 方向
  const nearbyStrikes = strikes.filter(
    (s) =>
      s.strike >= underlyingPrice * 0.95 && s.strike <= underlyingPrice * 1.05,
  );
  const nearbyNet = nearbyStrikes.reduce((sum, s) => sum + s.netGex, 0);
  let hedgingPressure: "positive" | "negative" | "neutral" = "neutral";
  if (nearbyNet > totalAbsGex * 0.05) hedgingPressure = "positive";
  else if (nearbyNet < -totalAbsGex * 0.05) hedgingPressure = "negative";

  // 10. 每1%波动的净 GEX
  const gexPer1PctMove = totalNetGex * 0.01;

  return {
    underlying,
    underlyingPrice,
    timestamp: Date.now(),
    strikes,
    totalNetGex,
    totalAbsGex,
    flipPoint,
    flipZone,
    hedgingPressure,
    gexPer1PctMove,
    exchangeBreakdown,
  };
}
