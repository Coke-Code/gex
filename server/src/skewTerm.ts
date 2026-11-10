// 各到期 25Δ 风险逆转（Put IV − Call IV）。与顶栏近端 skew 同一套挑选规则。

import { black76Delta, yearFraction } from "./greeks/black76";
import { NormalizedOption } from "./types";

export interface SkewSlice {
  expiry: string;
  days: number;
  putIv: number;
  callIv: number;
  rr: number;
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

function rrForExpiry(options: NormalizedOption[], nowMs: number): SkewSlice | null {
  if (options.length < 4) return null;
  const day = utcDay(options[0].expiryTimestamp);
  const days = Math.max(
    0,
    (Math.min(...options.map((option) => option.expiryTimestamp)) - nowMs) /
      (24 * 60 * 60 * 1000),
  );
  const forward = median(options.map((option) => option.forwardPrice));
  let call: { iv: number; distance: number } | null = null;
  let put: { iv: number; distance: number } | null = null;
  for (const option of options) {
    const timeYears = yearFraction(option.expiryTimestamp, nowMs);
    if (!(timeYears > 0)) continue;
    const delta = black76Delta(
      forward,
      option.strike,
      timeYears,
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
    expiry: day,
    days,
    putIv: put.iv,
    callIv: call.iv,
    rr: put.iv - call.iv,
  };
}

/** 近端到远月，最多 12 个可算 RR 的到期。 */
export function buildSkewTerm(
  options: NormalizedOption[],
  nowMs: number,
  maxRows = 12,
): SkewSlice[] {
  const groups = new Map<string, NormalizedOption[]>();
  for (const option of options) {
    const day = utcDay(option.expiryTimestamp);
    const list = groups.get(day);
    if (list) list.push(option);
    else groups.set(day, [option]);
  }
  const ranked = [...groups.entries()]
    .map(([day, group]) => ({
      day,
      group,
      days: Math.max(
        0,
        (Math.min(...group.map((option) => option.expiryTimestamp)) - nowMs) /
          (24 * 60 * 60 * 1000),
      ),
    }))
    .sort((a, b) => a.days - b.days);

  const slices: SkewSlice[] = [];
  for (const row of ranked) {
    if (slices.length >= maxRows) break;
    const slice = rrForExpiry(row.group, nowMs);
    if (slice) slices.push(slice);
  }
  return slices;
}

export function pickFrontSkew(slices: SkewSlice[]): SkewSlice | null {
  if (slices.length === 0) return null;
  return slices.find((slice) => slice.days >= 0.5 && slice.days <= 10) ?? slices[0];
}
