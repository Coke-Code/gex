// 只记录真实采样。进程重启后从磁盘恢复，不补造历史点。

import fs from "fs";
import path from "path";

export interface HistoryStrike {
  strike: number;
  netGex: number;
  /** 旧快照可能没有；对比 ΔOI 时需有值 */
  oi?: number;
}

export interface HistoryLevels {
  p1: number | null;
  n1: number | null;
  a1: number | null;
}

export type HistoryHedgingPressure = "positive" | "negative" | "neutral";

export interface HistorySnap {
  timestamp: number;
  flipPoint: number | null;
  totalNetGex: number;
  totalAbsGex: number;
  underlyingPrice: number;
  /** 与当时顶栏 Regime 一致；旧快照可缺，由客户端按 2% 规则回填 */
  hedgingPressure?: HistoryHedgingPressure;
  /** 旧文件没有这一项。没有档位时只能比翻转，不能比某一档变重了没有 */
  strikes: HistoryStrike[];
  /** GammaFlip 式关键价：P1/N1/A1，旧快照可缺 */
  levels?: HistoryLevels;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const MIN_AGE = 30 * 60 * 1000;

/**
 * 取离 4 小时前最近、且至少 30 分钟前的真实快照。
 * 旧快照没有档位时，改用带档位的那一份，这样「变重了」和标题上的时间是同一刻。
 */
export function pickBaseline(points: HistorySnap[], now: number): HistorySnap | null {
  const target = now - FOUR_HOURS;
  const eligible = points.filter((point) => now - point.timestamp >= MIN_AGE);
  if (eligible.length === 0) return null;
  eligible.sort(
    (a, b) => Math.abs(a.timestamp - target) - Math.abs(b.timestamp - target),
  );
  return eligible.find((point) => point.strikes.length > 0) ?? eligible[0];
}

const MAX_POINTS = 288;
const MIN_GAP_MS = 4 * 60 * 1000;

export class HistoryStore {
  private series = new Map<string, HistorySnap[]>();

  constructor(private readonly filePath: string) {
    this.series = this.read();
  }

  get(underlying: string): HistorySnap[] {
    return this.series.get(underlying.toUpperCase()) ?? [];
  }

  append(underlying: string, snap: HistorySnap): void {
    const coin = underlying.toUpperCase();
    const arr = this.series.get(coin) ?? [];
    const last = arr[arr.length - 1];
    if (last && snap.timestamp - last.timestamp < MIN_GAP_MS) {
      this.series.set(coin, arr);
      return;
    }
    arr.push(snap);
    while (arr.length > MAX_POINTS) arr.shift();
    this.series.set(coin, arr);
    this.write();
  }

  private read(): Map<string, HistorySnap[]> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Record<
        string,
        HistorySnap[]
      >;
      const map = new Map<string, HistorySnap[]>();
      for (const [coin, points] of Object.entries(raw)) {
        if (!Array.isArray(points)) continue;
        const clean = points
          .filter(isSnap)
          .slice(-MAX_POINTS)
          .map((snap) => ({ ...snap, strikes: cleanStrikes(snap.strikes) }));
        if (clean.length > 0) map.set(coin.toUpperCase(), clean);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  private write(): void {
    const payload: Record<string, HistorySnap[]> = {};
    for (const [coin, points] of this.series) payload[coin] = points;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.rmSync(this.filePath, { force: true });
    fs.renameSync(tmp, this.filePath);
  }
}

function cleanStrikes(value: unknown): HistoryStrike[] {
  if (!Array.isArray(value)) return [];
  const strikes: HistoryStrike[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const strike = (row as HistoryStrike).strike;
    const netGex = (row as HistoryStrike).netGex;
    const oi = (row as HistoryStrike).oi;
    if (Number.isFinite(strike) && Number.isFinite(netGex)) {
      const entry: HistoryStrike = { strike, netGex };
      if (Number.isFinite(oi) && (oi as number) >= 0) entry.oi = oi as number;
      strikes.push(entry);
    }
  }
  return strikes;
}

function isSnap(value: unknown): value is HistorySnap {
  if (!value || typeof value !== "object") return false;
  const snap = value as HistorySnap;
  return (
    Number.isFinite(snap.timestamp) &&
    Number.isFinite(snap.totalNetGex) &&
    Number.isFinite(snap.totalAbsGex) &&
    Number.isFinite(snap.underlyingPrice) &&
    (snap.flipPoint === null || Number.isFinite(snap.flipPoint))
  );
}
