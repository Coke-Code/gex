// OKX BTC-USD 期权。ctVal 通常是 0.01 BTC，未平仓优先用 oiCcy（已经是币）。
// markVol 和 fwdPx 用来重算 Black-76，不用交易所自己的 gamma。

import { ExchangeAdapter, ExchangeSource, NormalizedOption } from "../types";
import { coinOpenInterest, decimalIv, finite, getJson } from "./units";

const REST = "https://www.okx.com";

interface Instrument {
  instId: string;
  uly?: string;
  state?: string;
  ctVal?: string;
  ctMult?: string;
  optType?: string;
  stk?: string;
  expTime?: string;
}

interface Summary {
  instId: string;
  markVol?: string;
  fwdPx?: string;
}

interface Ticker {
  instId: string;
  volCcy24h?: string;
}

interface OpenInterest {
  instId: string;
  oi?: string;
  oiCcy?: string;
}

interface OkxResponse<T> {
  code?: string;
  msg?: string;
  data?: T;
}

async function okx<T>(path: string): Promise<T> {
  const result = await getJson<OkxResponse<T>>(`${REST}${path}`);
  if (result.code && result.code !== "0") {
    throw new Error(result.msg || `OKX ${result.code}`);
  }
  return result.data as T;
}

export class OkxAdapter implements ExchangeAdapter {
  name: ExchangeSource = "okx";

  async healthCheck(): Promise<boolean> {
    try {
      await this.fetchUnderlyingPrice("BTC");
      return true;
    } catch {
      return false;
    }
  }

  async fetchUnderlyingPrice(_underlying: string): Promise<number> {
    const data = await okx<Array<{ idxPx?: string }>>(
      "/api/v5/market/index-tickers?instId=BTC-USD",
    );
    return finite(data?.[0]?.idxPx);
  }

  async fetchOptions(underlying: string): Promise<NormalizedOption[]> {
    if (underlying.toUpperCase() !== "BTC") {
      throw new Error("Only BTC options are supported");
    }
    const [instruments, summaries, indexPrice, tickers] = await Promise.all([
      okx<Instrument[]>("/api/v5/public/instruments?instType=OPTION&uly=BTC-USD"),
      okx<Summary[]>("/api/v5/public/opt-summary?uly=BTC-USD"),
      this.fetchUnderlyingPrice("BTC"),
      okx<Ticker[]>("/api/v5/market/tickers?instType=OPTION&uly=BTC-USD").catch(
        () => [] as Ticker[],
      ),
    ]);
    const volumeById = new Map(
      (tickers ?? [])
        .filter((ticker) => ticker.volCcy24h != null && ticker.volCcy24h !== "")
        .map((ticker) => [ticker.instId, finite(ticker.volCcy24h)]),
    );
    const openInterest = await this.loadOpenInterest();

    const meta = new Map(
      (instruments ?? [])
        .filter((instrument) => instrument.state === "live" || !instrument.state)
        .map((instrument) => [instrument.instId, instrument]),
    );
    const summaryById = new Map(
      (summaries ?? []).map((summary) => [summary.instId, summary]),
    );

    const options: NormalizedOption[] = [];
    for (const [instId, instrument] of meta) {
      const summary = summaryById.get(instId);
      const oi = openInterest.get(instId);
      if (!summary || !oi) continue;
      const optionType =
        instrument.optType === "C"
          ? "call"
          : instrument.optType === "P"
            ? "put"
            : null;
      if (!optionType) continue;
      const contractSize =
        (finite(instrument.ctVal) || 0.01) * (finite(instrument.ctMult) || 1);
      const coins =
        finite(oi.oiCcy) > 0
          ? finite(oi.oiCcy)
          : coinOpenInterest(finite(oi.oi), contractSize);
      options.push({
        exchange: "okx",
        symbol: instId,
        underlying: "BTC",
        optionType,
        strike: finite(instrument.stk),
        expiryTimestamp: finite(instrument.expTime),
        forwardPrice: finite(summary.fwdPx) || indexPrice,
        markPrice: 0,
        openInterest: coins,
        volume24h: volumeById.has(instId) ? (volumeById.get(instId) as number) : null,
        impliedVolatility: decimalIv(finite(summary.markVol)),
      });
    }
    return options;
  }

  private async loadOpenInterest(): Promise<Map<string, OpenInterest>> {
    const paths = [
      "/api/v5/public/open-interest?instType=OPTION&uly=BTC-USD",
      "/api/v5/public/open-interest?instType=OPTION&instFamily=BTC-USD",
    ];
    let lastError: unknown;
    for (const path of paths) {
      try {
        const rows = await okx<OpenInterest[]>(path);
        if (rows?.length) {
          return new Map(rows.map((row) => [row.instId, row]));
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("OKX 没有返回未平仓");
  }
}
