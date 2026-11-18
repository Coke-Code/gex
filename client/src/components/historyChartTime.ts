export const HISTORY_DAYS = 30;
export const HISTORY_TICK_DAYS = 5;

const MS_DAY = 24 * 60 * 60 * 1000;
export const HISTORY_WINDOW_MS = HISTORY_DAYS * MS_DAY;
export const HISTORY_TICK_MS = HISTORY_TICK_DAYS * MS_DAY;

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

export function historyTimeAxisFromTimestamps(timestamps: number[]): {
  range: [number, number];
  tickvals: Date[];
  endMs: number;
} {
  const endMs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : Date.now();
  const startMs = endMs - HISTORY_WINDOW_MS;
  return {
    range: [startMs, endMs],
    tickvals: fiveDayTicks(startMs, endMs),
    endMs,
  };
}