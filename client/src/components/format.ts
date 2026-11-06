export function fmtUsd(value: number): string {
  const abs = Math.abs(value);
  const body =
    abs >= 1e9
      ? `${(abs / 1e9).toFixed(1)}B`
      : abs >= 1e6
        ? `${(abs / 1e6).toFixed(1)}M`
        : abs >= 1e3
          ? `${(abs / 1e3).toFixed(0)}K`
          : abs.toFixed(0);
  return body;
}

export function fmtPx(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtBtc(value: number): string {
  const abs = Math.abs(value);
  const body = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return `${body} BTC`;
}

export function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  if (hours < 10) return `${hours.toFixed(1)} 小时`;
  return `${Math.round(hours)} 小时`;
}

import { GammaCurvePoint } from "../types";

/** 在 gamma 曲线上按现货插值，和 server 的 gexAtSpotOnCurve 一致。 */
export function gexAtSpotOnCurve(curve: GammaCurvePoint[], spot: number): number | null {
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

export function fmtTenor(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}小时`;
  if (days < 10) return `${days.toFixed(days < 2 ? 1 : 0)}天`;
  return `${Math.round(days)}天`;
}
