import { HistorySnap } from "./history";
import {
  emptyHeatmapPayload,
  HEATMAP_BUCKET_MS,
  HEATMAP_STRIKE_SPAN,
  HistoryHeatmapPayload,
} from "./historyTypes";

const MAX_STRIKES = 96;

/** 每小时内取最新一条快照（库内可仍为 5 分钟） */
export function downsampleHourly(points: HistorySnap[], bucketMs = HEATMAP_BUCKET_MS): HistorySnap[] {
  const byBucket = new Map<number, HistorySnap>();
  for (const point of points) {
    const bucket = Math.floor(point.timestamp / bucketMs);
    const prev = byBucket.get(bucket);
    if (!prev || point.timestamp > prev.timestamp) byBucket.set(bucket, point);
  }
  return [...byBucket.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function buildHeatmapPayload(snaps: HistorySnap[]): HistoryHeatmapPayload | null {
  if (snaps.length < 2) return null;

  const span = HEATMAP_STRIKE_SPAN;
  const prices = snaps.map((row) => row.underlyingPrice);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sortedPrices.length / 2);
  const anchor =
    sortedPrices.length % 2 === 0
      ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
      : sortedPrices[mid];

  const lo = anchor * (1 - span);
  const hi = anchor * (1 + span);

  const byTs = new Map<number, Map<number, number>>();
  for (const snap of snaps) {
    const rowLo = snap.underlyingPrice * (1 - span);
    const rowHi = snap.underlyingPrice * (1 + span);
    let map = byTs.get(snap.timestamp);
    if (!map) {
      map = new Map();
      byTs.set(snap.timestamp, map);
    }
    for (const row of snap.strikes) {
      if (row.strike < rowLo || row.strike > rowHi) continue;
      map.set(row.strike, Math.round(row.netGex));
    }
  }

  const strikeSet = new Set<number>();
  for (const map of byTs.values()) {
    for (const strike of map.keys()) strikeSet.add(strike);
  }
  let strikes = [...strikeSet].filter((strike) => strike >= lo && strike <= hi).sort((a, b) => a - b);
  if (strikes.length > MAX_STRIKES) {
    const stride = Math.ceil(strikes.length / MAX_STRIKES);
    strikes = strikes.filter((_, index) => index % stride === 0);
  }
  if (strikes.length === 0) return null;

  const t = snaps.map((row) => row.timestamp);
  const p = snaps.map((row) => Math.round(row.underlyingPrice));
  const f = snaps.map((row) =>
    row.flipPoint != null && row.flipPoint > 0 ? Math.round(row.flipPoint) : null,
  );

  const z = strikes.map((strike) =>
    snaps.map((snap) => {
      const value = byTs.get(snap.timestamp)?.get(strike);
      return value === undefined ? null : value;
    }),
  );

  return { span, t, p, f, k: strikes, z };
}

export function heatmapPayloadFromSeries(
  points: HistorySnap[],
  sinceMs: number,
): HistoryHeatmapPayload {
  const windowed = points.filter((row) => row.timestamp >= sinceMs);
  const hourly = downsampleHourly(windowed);
  return buildHeatmapPayload(hourly) ?? emptyHeatmapPayload();
}