export function finite(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 交易所 IV 有的给小数（0.55），有的给百分数（55）。
 * BTC 波动率几乎不会落在 1%–3% 的歧义区间。
 */
export function decimalIv(raw: number): number {
  if (!(raw > 0)) return 0;
  return raw > 3 ? raw / 100 : raw;
}

/** 张数 × 每张对应的 BTC。Deribit 的未平仓已经是币，不要再乘。 */
export function coinOpenInterest(contracts: number, contractSize: number): number {
  if (!(contracts > 0) || !(contractSize > 0)) return 0;
  return contracts * contractSize;
}

export async function getJson<T>(url: string, timeoutMs = 6_000): Promise<T> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}
