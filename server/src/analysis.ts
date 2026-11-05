// 把 BTC 期权链收成价位、期限和速度。各所先折成币数，再算同一套美元 GEX。

import { black76Delta, yearFraction } from "./greeks/black76";
import {
  GexContract,
  aggregateStrikes,
  buildGammaCurve,
  dollarGex,
  findZeroGamma,
  gexAtSpotOnCurve,
} from "./greeks/exposure";
import { chartMarkers } from "./markers";
import {
  DataQuality,
  ExchangeSource,
  ExpirySlice,
  GexAnalysis,
  NormalizedOption,
  StrikeExpiry,
  VenueFilter,
  VenueStatus,
} from "./types";

const MIN_IV = 0.01;
const MAX_IV = 5;
const VENUES: ExchangeSource[] = ["deribit", "binance", "okx"];

interface DropCounts {
  expired: number;
  noOpenInterest: number;
  badIv: number;
  badPrice: number;
}

function emptyDrops(): DropCounts {
  return { expired: 0, noOpenInterest: 0, badIv: 0, badPrice: 0 };
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

interface UsedOption extends NormalizedOption {
  gex: number;
  timeYears: number;
}

function buildExpiries(used: UsedOption[], nowMs: number): ExpirySlice[] {
  const groups = new Map<string, UsedOption[]>();
  for (const option of used) {
    const day = utcDay(option.expiryTimestamp);
    const list = groups.get(day);
    if (list) list.push(option);
    else groups.set(day, [option]);
  }

  const slices: ExpirySlice[] = [];
  for (const [day, options] of groups) {
    const forward = median(options.map((option) => option.forwardPrice));
    let atmStrike = options[0].strike;
    let atmDistance = Infinity;
    for (const option of options) {
      const distance = Math.abs(option.strike - forward);
      if (distance < atmDistance) {
        atmDistance = distance;
        atmStrike = option.strike;
      }
    }
    const atmIv = options
      .filter((option) => option.strike === atmStrike)
      .map((option) => option.impliedVolatility);
    const expiryTimestamp = Math.min(
      ...options.map((option) => option.expiryTimestamp),
    );
    slices.push({
      expiry: day,
      expiryTimestamp,
      days: Math.max(0, (expiryTimestamp - nowMs) / (24 * 60 * 60 * 1000)),
      netGex: options.reduce((sum, option) => sum + option.gex, 0),
      absGex: options.reduce((sum, option) => sum + Math.abs(option.gex), 0),
      atmIv: atmIv.length
        ? atmIv.reduce((sum, iv) => sum + iv, 0) / atmIv.length
        : null,
    });
  }

  return slices.sort((a, b) => a.expiryTimestamp - b.expiryTimestamp);
}

/** 一日 1σ 价格距离。隐波是年化小数。 */
export function oneDayMove(price: number, iv: number): number {
  if (!(price > 0) || !(iv > 0)) return 0;
  return price * iv * Math.sqrt(1 / 365);
}

function dailyMove(expiries: ExpirySlice[], price: number): GexAnalysis["move"] {
  if (!(price > 0)) return null;
  const candidates = expiries.filter(
    (slice) => slice.atmIv != null && slice.atmIv > 0 && slice.days >= 0.2 && slice.days <= 10,
  );
  if (candidates.length === 0) return null;
  const best = candidates.reduce((near, slice) =>
    Math.abs(slice.days - 1) < Math.abs(near.days - 1) ? slice : near,
  );
  const iv = best.atmIv ?? 0;
  const oneDay = oneDayMove(price, iv);
  if (!(oneDay > 0)) return null;
  return { expiry: best.expiry, days: best.days, iv, oneDay };
}

function splitByExpiry(used: UsedOption[], nowMs: number): Map<number, StrikeExpiry[]> {
  const buckets = new Map<number, Map<string, StrikeExpiry & { ts: number }>>();
  for (const option of used) {
    const day = utcDay(option.expiryTimestamp);
    let bucket = buckets.get(option.strike);
    if (!bucket) {
      bucket = new Map();
      buckets.set(option.strike, bucket);
    }
    const days = Math.max(0, (option.expiryTimestamp - nowMs) / (24 * 60 * 60 * 1000));
    const row = bucket.get(day) ?? {
      expiry: day,
      days,
      netGex: 0,
      ts: option.expiryTimestamp,
    };
    row.netGex += option.gex;
    row.days = Math.min(row.days, days);
    row.ts = Math.min(row.ts, option.expiryTimestamp);
    bucket.set(day, row);
  }
  const byStrike = new Map<number, StrikeExpiry[]>();
  for (const [strike, bucket] of buckets) {
    byStrike.set(
      strike,
      [...bucket.values()]
        .sort((a, b) => a.ts - b.ts)
        .map(({ expiry, days, netGex }) => ({ expiry, days, netGex })),
    );
  }
  return byStrike;
}

function frontSkew(used: UsedOption[], nowMs: number): GexAnalysis["skew"] {
  const groups = new Map<string, UsedOption[]>();
  for (const option of used) {
    const day = utcDay(option.expiryTimestamp);
    const list = groups.get(day);
    if (list) list.push(option);
    else groups.set(day, [option]);
  }

  const ranked = [...groups.entries()]
    .map(([day, options]) => ({
      day,
      options,
      days: Math.max(
        0,
        (Math.min(...options.map((option) => option.expiryTimestamp)) - nowMs) /
          (24 * 60 * 60 * 1000),
      ),
    }))
    .filter((group) => group.options.length >= 4)
    .sort((a, b) => a.days - b.days);

  const front =
    ranked.find((group) => group.days >= 0.5 && group.days <= 10) ?? ranked[0];
  if (!front) return null;

  const forward = median(front.options.map((option) => option.forwardPrice));
  let call: { iv: number; distance: number } | null = null;
  let put: { iv: number; distance: number } | null = null;
  for (const option of front.options) {
    const delta = black76Delta(
      forward,
      option.strike,
      option.timeYears,
      option.impliedVolatility,
      option.optionType,
    );
    const target = option.optionType === "call" ? 0.25 : -0.25;
    const distance = Math.abs(delta - target);
    if (distance > 0.08) continue;
    if (option.optionType === "call" && (!call || distance < call.distance)) {
      call = { iv: option.impliedVolatility, distance };
    }
    if (option.optionType === "put" && (!put || distance < put.distance)) {
      put = { iv: option.impliedVolatility, distance };
    }
  }
  if (!call || !put) return null;
  return {
    expiry: front.day,
    days: front.days,
    putIv: put.iv,
    callIv: call.iv,
    rr: put.iv - call.iv,
  };
}

export function analyzeChain(input: {
  underlying: string;
  indexPrice: number;
  options: NormalizedOption[];
  nowMs?: number;
  venue?: VenueFilter;
  venueNotes?: Array<{ venue: ExchangeSource; error: string | null; included: boolean }>;
}): GexAnalysis {
  const nowMs = input.nowMs ?? Date.now();
  const indexPrice = input.indexPrice;
  const venue = input.venue ?? "all";
  const drops = emptyDrops();
  const contracts: GexContract[] = [];
  const used: UsedOption[] = [];
  const signed: Array<{
    strike: number;
    optionType: NormalizedOption["optionType"];
    gex: number;
    openInterest: number;
    volume: number | null;
    exchange: ExchangeSource;
  }> = [];

  for (const option of input.options) {
    const timeYears = yearFraction(option.expiryTimestamp, nowMs);
    if (!(timeYears > 0)) {
      drops.expired += 1;
      continue;
    }
    if (!(option.openInterest > 0)) {
      drops.noOpenInterest += 1;
      continue;
    }
    if (
      !Number.isFinite(option.impliedVolatility) ||
      option.impliedVolatility < MIN_IV ||
      option.impliedVolatility > MAX_IV
    ) {
      drops.badIv += 1;
      continue;
    }
    if (!(option.forwardPrice > 0) || !(option.strike > 0)) {
      drops.badPrice += 1;
      continue;
    }

    const contract: GexContract = {
      strike: option.strike,
      optionType: option.optionType,
      openInterest: option.openInterest,
      iv: option.impliedVolatility,
      forward: option.forwardPrice,
      timeYears,
    };
    const gex = dollarGex(contract);
    contracts.push(contract);
    used.push({ ...option, gex, timeYears });
    signed.push({
      strike: option.strike,
      optionType: option.optionType,
      gex,
      openInterest: option.openInterest,
      volume: option.volume24h,
      exchange: option.exchange,
    });
  }

  const strikes = aggregateStrikes(signed);
  const expirySplit = splitByExpiry(used, nowMs);
  for (const strike of strikes) {
    strike.byExpiry = expirySplit.get(strike.strike) ?? [];
  }
  const totalNetGex = strikes.reduce((sum, row) => sum + row.netGex, 0);
  const totalAbsGex = strikes.reduce((sum, row) => sum + row.absGex, 0);

  const gammaCurve =
    indexPrice > 0 ? buildGammaCurve(contracts, indexPrice) : [];
  const zero = findZeroGamma(gammaCurve, indexPrice);
  const up =
    indexPrice > 0 ? gexAtSpotOnCurve(gammaCurve, indexPrice * 1.01) : null;

  let hedgingPressure: GexAnalysis["hedgingPressure"] = "neutral";
  if (totalAbsGex > 0 && totalNetGex > totalAbsGex * 0.02) {
    hedgingPressure = "positive";
  } else if (totalAbsGex > 0 && totalNetGex < -totalAbsGex * 0.02) {
    hedgingPressure = "negative";
  }

  const support =
    strikes
      .filter((row) => row.strike < indexPrice && row.netGex < 0)
      .sort((a, b) => a.netGex - b.netGex)[0] ?? null;
  const resistance =
    strikes
      .filter((row) => row.strike > indexPrice && row.netGex > 0)
      .sort((a, b) => b.netGex - a.netGex)[0] ?? null;

  const byVenue = new Map<
    ExchangeSource,
    { netGex: number; absGex: number; used: number; oi: number }
  >();
  for (const name of VENUES) {
    byVenue.set(name, { netGex: 0, absGex: 0, used: 0, oi: 0 });
  }
  for (const option of used) {
    const book = byVenue.get(option.exchange)!;
    book.netGex += option.gex;
    book.absGex += Math.abs(option.gex);
    book.used += 1;
    book.oi += option.openInterest;
  }

  const notes = new Map(
    (input.venueNotes ?? []).map((note) => [note.venue, note]),
  );
  const venues: VenueStatus[] = VENUES.map((name) => {
    const book = byVenue.get(name)!;
    const note = notes.get(name);
    return {
      venue: name,
      online: note ? note.error == null : book.used > 0,
      error: note?.error ?? null,
      included: note?.included ?? (venue === "all" || venue === name),
      contractsUsed: book.used,
      netGex: book.netGex,
      absGex: book.absGex,
      flipPoint: null,
    };
  });

  const dropped =
    drops.expired + drops.noOpenInterest + drops.badIv + drops.badPrice;
  const quality: DataQuality = {
    model: "black76",
    signConvention: "dealer-long-calls-short-puts",
    unit: "usd-per-1pct",
    yearBasis: 365,
    openInterest: "delayed",
    contractsSeen: input.options.length,
    contractsUsed: contracts.length,
    contractsDropped: dropped,
    dropped: drops,
  };

  const expiries = buildExpiries(used, nowMs);

  const exchangeBreakdown: GexAnalysis["exchangeBreakdown"] = {};
  for (const name of VENUES) {
    const book = byVenue.get(name)!;
    if (book.used === 0) continue;
    exchangeBreakdown[name] = {
      totalNetGex: book.netGex,
      optionCount: book.used,
      totalOI: book.oi,
    };
  }

  return {
    underlying: input.underlying,
    underlyingPrice: indexPrice,
    timestamp: nowMs,
    strikes,
    totalNetGex,
    totalAbsGex,
    flipPoint: zero?.flipPoint ?? null,
    flipZone: zero?.flipZone ?? null,
    markers: chartMarkers(strikes, gammaCurve, zero?.flipPoint ?? null, indexPrice),
    hedgingPressure,
    gexPer1PctMove: totalNetGex,
    gammaCurve,
    levels: {
      support: support
        ? { strike: support.strike, netGex: support.netGex }
        : null,
      resistance: resistance
        ? { strike: resistance.strike, netGex: resistance.netGex }
        : null,
    },
    expiries,
    move: dailyMove(expiries, indexPrice),
    speed: {
      hedgeUsdPer1Pct: totalNetGex,
      gexChangePer1Pct: up == null ? null : up - totalNetGex,
    },
    change: null,
    skew: frontSkew(used, nowMs),
    venue,
    venues,
    quality,
    exchangeBreakdown,
  };
}

/** 单所持仓自己的翻转。和聚合翻转不是一回事。 */
export function chainFlip(
  options: NormalizedOption[],
  indexPrice: number,
  nowMs?: number,
): number | null {
  if (!(indexPrice > 0) || options.length === 0) return null;
  return analyzeChain({
    underlying: "BTC",
    indexPrice,
    options,
    nowMs,
    venue: options[0]?.exchange ?? "all",
  }).flipPoint;
}
