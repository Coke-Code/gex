import { HistorySnap } from "../types";

export const HISTORY_DAYS = 30;
export const HISTORY_TICK_DAYS = 5;

const MS_DAY = 24 * 60 * 60 * 1000;
export const HISTORY_WINDOW_MS = HISTORY_DAYS * MS_DAY;
export const HISTORY_TICK_MS = HISTORY_TICK_DAYS * MS_DAY;

/** 以序列末端为右边界，取最近 30 天内的采样点。 */
export function historyWindow(points: HistorySnap[]): HistorySnap[] {
  if (points.length === 0) return [];
  const end = points[points.length - 1].timestamp;
  const start = end - HISTORY_WINDOW_MS;
  return points.filter((row) => row.timestamp >= start);
}

function fiveDayTicks(startMs: number, endMs: number): Date[] {
  const ticks: Date[] = [];
  let cursor = Math.ceil(startMs / HISTORY_TICK_MS) * HISTORY_TICK_MS;
  if (cursor < startMs) cursor += HISTORY_TICK_MS;
  while (cursor <= endMs) {
    ticks.push(new Date(cursor));
    cursor += HISTORY_TICK_MS;
  }
  if (ticks.length === 0) {
    ticks.push(new Date(startMs), new Date(endMs));
  }
  return ticks;
}

export function historyTimeAxis(points: HistorySnap[]): {
  range: [number, number];
  tickvals: Date[];
  endMs: number;
} {
  const rows = historyWindow(points);
  const endMs = rows.length > 0 ? rows[rows.length - 1].timestamp : Date.now();
  const startMs = endMs - HISTORY_WINDOW_MS;
  return {
    range: [startMs, endMs],
    tickvals: fiveDayTicks(startMs, endMs),
    endMs,
  };
}