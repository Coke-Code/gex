// 美元 Gamma Exposure。
//
// 主流看板（SqueezeMetrics / SpotGamma / GammaFlip）用的是：
//   GEX = Γ × 持仓 × 合约乘数 × 价格² × 0.01
// 股票期权乘数是 100；Deribit 期权的未平仓已经是币数，乘数按 1。
// 符号：客户卖 Call、买 Put，做市商因此多 Call、空 Put。
// Call 贡献为正，Put 贡献为负。这是公开持仓下的库存假设，不是真实成交方向。
//
// 结果的单位是：现货波动 1% 时，做市商要调整的美元对冲名义。
// 正数表示上涨时卖出、下跌时买入（抑制波动）。

import { black76Gamma } from "./black76";
import { ExchangeSource, OptionType, StrikeGex } from "../types";

export interface GexContract {
  strike: number;
  optionType: OptionType;
  openInterest: number;
  iv: number;
  /** 该合约当前的到期远期 */
  forward: number;
  timeYears: number;
}

export interface GammaCurvePoint {
  spot: number;
  totalNetGex: number;
}

export interface ZeroGamma {
  flipPoint: number;
  flipZone: { low: number; high: number };
}

/** 单张合约的带符号美元 GEX。forward 可换成情景远期。 */
export function dollarGex(contract: GexContract, forward = contract.forward): number {
  const gamma = black76Gamma(
    forward,
    contract.strike,
    contract.timeYears,
    contract.iv,
  );
  const sign = contract.optionType === "call" ? 1 : -1;
  return sign * gamma * contract.openInterest * forward * forward * 0.01;
}

/**
 * 情景现货下的净 GEX。基差 F/S 保持不变（远期随现货等比移动），IV 按行权价钉住。
 */
export function netGexAtSpot(
  contracts: GexContract[],
  indexSpot: number,
  scenarioSpot: number,
): number {
  if (!(indexSpot > 0) || !(scenarioSpot > 0)) return 0;
  const scale = scenarioSpot / indexSpot;
  let total = 0;
  for (const contract of contracts) {
    total += dollarGex(contract, contract.forward * scale);
  }
  return total;
}

export function aggregateStrikes(
  rows: Array<{
    strike: number;
    optionType: OptionType;
    gex: number;
    openInterest: number;
    /** 不传表示这个合约没有成交量 */
    volume?: number | null;
    exchange?: ExchangeSource;
  }>,
): StrikeGex[] {
  const strikeMap = new Map<number, StrikeGex & { sawVolume: boolean; missedVolume: boolean }>();

  for (const row of rows) {
    let entry = strikeMap.get(row.strike);
    if (!entry) {
      entry = {
        strike: row.strike,
        callGex: 0,
        putGex: 0,
        netGex: 0,
        absGex: 0,
        oi: 0,
        volume: null,
        volumePartial: false,
        byExpiry: [],
        netThen: null,
        oiThen: null,
        breakdown: {},
        sawVolume: false,
        missedVolume: false,
      };
      strikeMap.set(row.strike, entry);
    }

    const book = row.exchange
      ? (entry.breakdown[row.exchange] ??= { callGex: 0, putGex: 0, oi: 0 })
      : null;

    if (row.optionType === "call") {
      entry.callGex += row.gex;
      if (book) book.callGex += row.gex;
    } else {
      const magnitude = -row.gex;
      entry.putGex += magnitude;
      if (book) book.putGex += magnitude;
    }
    entry.oi += row.openInterest;
    if (book) book.oi += row.openInterest;
    if (row.volume == null) entry.missedVolume = true;
    else {
      entry.sawVolume = true;
      entry.volume = (entry.volume ?? 0) + row.volume;
    }
  }

  const strikes: StrikeGex[] = [];
  for (const entry of strikeMap.values()) {
    entry.netGex = entry.callGex - entry.putGex;
    entry.absGex = entry.callGex + entry.putGex;
    entry.volumePartial = entry.sawVolume && entry.missedVolume;
    if (!entry.sawVolume) entry.volume = null;
    const { sawVolume: _saw, missedVolume: _missed, ...strike } = entry;
    strikes.push(strike);
  }

  return strikes.sort((a, b) => a.strike - b.strike);
}

/** 现货从 -30% 到 +30%，每步 0.5%。步长跟现货走，不跟币种的美元价格走。 */
export function buildGammaCurve(
  contracts: GexContract[],
  indexSpot: number,
): GammaCurvePoint[] {
  if (!(indexSpot > 0) || contracts.length === 0) return [];

  const points: GammaCurvePoint[] = [];
  for (let i = 0; i <= 120; i++) {
    const spot = indexSpot * (0.7 + i * 0.005);
    points.push({
      spot,
      totalNetGex: netGexAtSpot(contracts, indexSpot, spot),
    });
  }
  return points;
}

/**
 * 零 gamma：净 GEX 沿现货轴穿过 0 的位置，取离现货最近的一次。
 * 不是行权价柱状图上第一次变号。
 */
export function findZeroGamma(
  curve: GammaCurvePoint[],
  indexSpot: number,
): ZeroGamma | null {
  let flipPoint = Number.NaN;
  let low = 0;
  let high = 0;
  let distance = Number.POSITIVE_INFINITY;

  const consider = (candidate: number, zoneLow: number, zoneHigh: number) => {
    if (!Number.isFinite(candidate)) return;
    const nextDistance = Math.abs(candidate - indexSpot);
    if (nextDistance < distance) {
      flipPoint = candidate;
      low = zoneLow;
      high = zoneHigh;
      distance = nextDistance;
    }
  };

  for (let i = 0; i < curve.length; i++) {
    const point = curve[i];
    if (point.totalNetGex === 0) {
      consider(point.spot, point.spot, point.spot);
    }
    if (i === 0) continue;
    const prev = curve[i - 1];
    const crossed =
      (prev.totalNetGex < 0 && point.totalNetGex > 0) ||
      (prev.totalNetGex > 0 && point.totalNetGex < 0);
    if (!crossed) continue;
    const span = Math.abs(prev.totalNetGex) + Math.abs(point.totalNetGex);
    const weight = span === 0 ? 0 : Math.abs(prev.totalNetGex) / span;
    consider(
      prev.spot + (point.spot - prev.spot) * weight,
      Math.min(prev.spot, point.spot),
      Math.max(prev.spot, point.spot),
    );
  }

  if (!Number.isFinite(flipPoint)) return null;
  return { flipPoint, flipZone: { low, high } };
}

/** 在 gamma 曲线上按现货线性插值。 */
export function gexAtSpotOnCurve(
  curve: GammaCurvePoint[],
  spot: number,
): number | null {
  if (curve.length === 0 || !(spot > 0)) return null;
  if (spot <= curve[0].spot) return curve[0].totalNetGex;
  const last = curve[curve.length - 1];
  if (spot >= last.spot) return last.totalNetGex;
  for (let i = 1; i < curve.length; i++) {
    const left = curve[i - 1];
    const right = curve[i];
    if (spot > right.spot) continue;
    const span = right.spot - left.spot;
    const weight = span === 0 ? 0 : (spot - left.spot) / span;
    return left.totalNetGex + (right.totalNetGex - left.totalNetGex) * weight;
  }
  return last.totalNetGex;
}
