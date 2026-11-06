// 各到期日的 GEX 标记与 Max Pain（公开 OI + 与全链相同的 GEX 模型）。

import { chartMarkers } from "./markers";
import {
  GexContract,
  aggregateStrikes,
  buildGammaCurve,
  findZeroGamma,
} from "./greeks/exposure";
import { ChartMarker, ExchangeSource, TermStructureSlice } from "./types";

const TERM_MARKERS = new Set<ChartMarker["kind"]>(["P", "N", "A", "F"]);
const MAX_SLICES = 14;
const MIN_CONTRACTS = 4;

export interface TermStructureInput {
  options: Array<{
    strike: number;
    optionType: "call" | "put";
    openInterest: number;
    gex: number;
    timeYears: number;
    impliedVolatility: number;
    forwardPrice: number;
    expiryTimestamp: number;
    exchange: ExchangeSource;
  }>;
  indexPrice: number;
  nowMs: number;
  expectedVenues: ExchangeSource[];
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 到期结算：使 call/put 赔付总和最小的行权价（OI 为币数，价位为 USD）。 */
export function maxPain(
  options: Array<{ strike: number; optionType: "call" | "put"; openInterest: number }>,
): number | null {
  const byStrike = new Map<number, { call: number; put: number }>();
  for (const row of options) {
    const slot = byStrike.get(row.strike) ?? { call: 0, put: 0 };
    if (row.optionType === "call") slot.call += row.openInterest;
    else slot.put += row.openInterest;
    byStrike.set(row.strike, slot);
  }
  const strikes = [...byStrike.keys()].sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  let best = strikes[0];
  let bestPain = Number.POSITIVE_INFINITY;
  for (const spot of strikes) {
    let pain = 0;
    for (const [strike, oi] of byStrike) {
      if (spot > strike) pain += oi.call * (spot - strike);
      if (spot < strike) pain += oi.put * (strike - spot);
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = spot;
    }
  }
  return best;
}

function venueNote(
  options: TermStructureInput["options"],
  expectedVenues: ExchangeSource[],
): string | null {
  const seen = new Set(options.map((row) => row.exchange));
  const missing = expectedVenues.filter((venue) => !seen.has(venue));
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`缺 ${missing.join("、")}`);
  parts.push("OI 有延迟");
  return parts.join(" · ");
}

export function buildTermStructure(input: TermStructureInput): TermStructureSlice[] {
  const { options, indexPrice, nowMs, expectedVenues } = input;
  if (!(indexPrice > 0) || options.length === 0) return [];

  const groups = new Map<string, TermStructureInput["options"]>();
  for (const option of options) {
    const day = utcDay(option.expiryTimestamp);
    const list = groups.get(day);
    if (list) list.push(option);
    else groups.set(day, [option]);
  }

  const ranked = [...groups.entries()]
    .map(([expiry, rows]) => ({
      expiry,
      rows,
      expiryTimestamp: Math.min(...rows.map((row) => row.expiryTimestamp)),
      days: Math.max(
        0,
        (Math.min(...rows.map((row) => row.expiryTimestamp)) - nowMs) /
          (24 * 60 * 60 * 1000),
      ),
    }))
    .sort((a, b) => a.expiryTimestamp - b.expiryTimestamp)
    .slice(0, MAX_SLICES);

  const slices: TermStructureSlice[] = [];
  for (const group of ranked) {
    if (group.rows.length < MIN_CONTRACTS) continue;

    const contracts: GexContract[] = group.rows.map((row) => ({
      strike: row.strike,
      optionType: row.optionType,
      openInterest: row.openInterest,
      iv: row.impliedVolatility,
      forward: row.forwardPrice,
      timeYears: row.timeYears,
    }));

    const signed = group.rows.map((row) => ({
      strike: row.strike,
      optionType: row.optionType,
      gex: row.gex,
      openInterest: row.openInterest,
      volume: null as number | null,
      exchange: row.exchange,
    }));

    const strikes = aggregateStrikes(signed);
    const curve = buildGammaCurve(contracts, indexPrice);
    const zero = findZeroGamma(curve, indexPrice);
    const markers = chartMarkers(
      strikes,
      curve,
      zero?.flipPoint ?? null,
      indexPrice,
    ).filter((marker) => TERM_MARKERS.has(marker.kind));

    slices.push({
      expiry: group.expiry,
      days: group.days,
      contractsUsed: group.rows.length,
      flipPoint: zero?.flipPoint ?? null,
      maxPain: maxPain(group.rows),
      markers,
      qualityNote: venueNote(group.rows, expectedVenues),
    });
  }

  return slices;
}
