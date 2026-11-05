// Binance 欧式期权，USDT 保证金。未平仓按合约 unit 折成 BTC。
// 公开接口没有远期，用同一到期日的平价看涨减看跌还原远期。

import { ExchangeAdapter, ExchangeSource, NormalizedOption } from "../types";
import { coinOpenInterest, decimalIv, finite, getJson } from "./units";

const REST = "https://eapi.binance.com";

interface OptionSymbol {
  symbol: string;
  underlying?: string;
  side?: string;
  strikePrice?: string;
  expiryDate?: number;
  unit?: number;
  status?: string;
}

interface MarkRow {
  symbol: string;
  markPrice?: string;
  markIV?: string;
}

interface TickerRow {
  symbol?: string;
  volume?: string;
}

interface OpenInterestRow {
  symbol?: string;
  sumOpenInterest?: string;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

function asRows(payload: unknown): OpenInterestRow[] {
  if (Array.isArray(payload)) return payload as OpenInterestRow[];
  if (payload && typeof payload === "object") {
    const record = payload as { data?: unknown; symbol?: string };
    if (Array.isArray(record.data)) return record.data as OpenInterestRow[];
    if (record.symbol) return [payload as OpenInterestRow];
  }
  return [];
}

export class BinanceAdapter implements ExchangeAdapter {
  name: ExchangeSource = "binance";
  private symbolsAt = 0;
  private symbols: OptionSymbol[] = [];

  async healthCheck(): Promise<boolean> {
    try {
      await this.fetchUnderlyingPrice("BTC");
      return true;
    } catch {
      return false;
    }
  }

  async fetchUnderlyingPrice(_underlying: string): Promise<number> {
    const result = await getJson<{ indexPrice?: string }>(
      `${REST}/eapi/v1/index?underlying=BTCUSDT`,
    );
    return finite(result.indexPrice);
  }

  private async loadSymbols(): Promise<OptionSymbol[]> {
    if (this.symbols.length > 0 && Date.now() - this.symbolsAt < 10 * 60 * 1000) {
      return this.symbols;
    }
    const info = await getJson<{ optionSymbols?: OptionSymbol[] }>(
      `${REST}/eapi/v1/exchangeInfo`,
    );
    this.symbols = (info.optionSymbols ?? []).filter(
      (symbol) =>
        symbol.underlying === "BTCUSDT" &&
        symbol.status !== "SETTLED" &&
        symbol.symbol.startsWith("BTC-"),
    );
    this.symbolsAt = Date.now();
    return this.symbols;
  }

  async fetchOptions(underlying: string): Promise<NormalizedOption[]> {
    if (underlying.toUpperCase() !== "BTC") {
      throw new Error("Only BTC options are supported");
    }
    const [symbols, marks, indexPrice, tickers] = await Promise.all([
      this.loadSymbols(),
      getJson<MarkRow[]>(`${REST}/eapi/v1/mark`),
      this.fetchUnderlyingPrice("BTC"),
      loadVolume(),
    ]);
    const meta = new Map(symbols.map((symbol) => [symbol.symbol, symbol]));
    const markBySymbol = new Map(
      marks
        .filter((mark) => mark.symbol.startsWith("BTC-"))
        .map((mark) => [mark.symbol, mark]),
    );

    const expiries = [
      ...new Set(
        symbols
          .map((symbol) => symbol.symbol.split("-")[1])
          .filter((expiry) => /^\d{6}$/.test(expiry ?? "")),
      ),
    ];
    const oiRows = (
      await mapPool(expiries, 4, async (expiry) => {
        try {
          const payload = await getJson<unknown>(
            `${REST}/eapi/v1/openInterest?underlyingAsset=BTC&expiration=${expiry}`,
          );
          return asRows(payload);
        } catch {
          return [];
        }
      })
    ).flat();
    const oiBySymbol = new Map(
      oiRows
        .filter((row) => row.symbol)
        .map((row) => [row.symbol as string, finite(row.sumOpenInterest)]),
    );
    if (oiBySymbol.size === 0) {
      throw new Error("Binance 没有返回未平仓");
    }

    const forwards = impliedForwards(meta, markBySymbol, indexPrice);
    const options: NormalizedOption[] = [];
    for (const symbol of symbols) {
      const mark = markBySymbol.get(symbol.symbol);
      if (!mark) continue;
      const side = symbol.side?.toUpperCase();
      const optionType =
        side === "CALL" || symbol.symbol.endsWith("-C")
          ? "call"
          : side === "PUT" || symbol.symbol.endsWith("-P")
            ? "put"
            : null;
      if (!optionType) continue;
      const expiryCode = symbol.symbol.split("-")[1];
      options.push({
        exchange: "binance",
        symbol: symbol.symbol,
        underlying: "BTC",
        optionType,
        strike: finite(symbol.strikePrice),
        expiryTimestamp:
          finite(symbol.expiryDate) || yymmddToUtcMs(expiryCode),
        forwardPrice: forwards.get(expiryCode) || indexPrice,
        markPrice: finite(mark.markPrice),
        openInterest: coinOpenInterest(
          oiBySymbol.get(symbol.symbol) ?? 0,
          finite(symbol.unit) || 1,
        ),
        volume24h: tickers.has(symbol.symbol)
          ? coinOpenInterest(tickers.get(symbol.symbol) ?? 0, finite(symbol.unit) || 1)
          : null,
        impliedVolatility: decimalIv(finite(mark.markIV)),
      });
    }
    return options;
  }
}

async function loadVolume(): Promise<Map<string, number>> {
  try {
    const rows = await getJson<TickerRow[]>(`${REST}/eapi/v1/ticker`);
    const volume = new Map<string, number>();
    for (const row of rows) {
      if (!row.symbol?.startsWith("BTC-")) continue;
      volume.set(row.symbol, finite(row.volume));
    }
    return volume;
  } catch {
    return new Map();
  }
}

function impliedForwards(
  meta: Map<string, OptionSymbol>,
  marks: Map<string, MarkRow>,
  indexPrice: number,
): Map<string, number> {
  const pairs = new Map<string, { call?: number; put?: number; strike: number }>();
  for (const [symbol, mark] of marks) {
    const info = meta.get(symbol);
    const parts = symbol.split("-");
    if (parts.length < 4) continue;
    const expiry = parts[1];
    const strike = finite(info?.strikePrice ?? parts[2]);
    const premium = finite(mark.markPrice);
    if (!(strike > 0) || !(premium > 0)) continue;
    const key = `${expiry}:${strike}`;
    const pair = pairs.get(key) ?? { strike };
    if (symbol.endsWith("-C") || info?.side?.toUpperCase() === "CALL") pair.call = premium;
    if (symbol.endsWith("-P") || info?.side?.toUpperCase() === "PUT") pair.put = premium;
    pairs.set(key, pair);
  }

  const byExpiry = new Map<string, { strike: number; forward: number }[]>();
  for (const [key, pair] of pairs) {
    if (pair.call == null || pair.put == null) continue;
    const forward = pair.strike + pair.call - pair.put;
    if (!(forward > 0) || Math.abs(forward / indexPrice - 1) > 0.25) continue;
    const expiry = key.split(":")[0];
    const list = byExpiry.get(expiry) ?? [];
    list.push({ strike: pair.strike, forward });
    byExpiry.set(expiry, list);
  }

  const forwards = new Map<string, number>();
  for (const [expiry, list] of byExpiry) {
    const nearest = [...list].sort(
      (a, b) => Math.abs(a.strike - indexPrice) - Math.abs(b.strike - indexPrice),
    )[0];
    forwards.set(expiry, nearest.forward);
  }
  return forwards;
}

function yymmddToUtcMs(yymmdd: string | undefined): number {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return 0;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4)) - 1;
  const day = Number(yymmdd.slice(4, 6));
  return Date.UTC(year, month, day, 8, 0, 0);
}
