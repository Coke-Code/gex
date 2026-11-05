// Deribit 公开行情。book summary 不含希腊字母，只取远期、mark IV 和未平仓。

import { ExchangeAdapter, ExchangeSource, NormalizedOption } from "../types";

const DERIBIT_REST = "https://www.deribit.com/api/v2";

interface DeribitInstrument {
  instrument_name: string;
  option_type: "call" | "put";
  strike: number;
  expiration_timestamp: number;
  is_active: boolean;
  kind: string;
}

interface BookSummary {
  instrument_name: string;
  mark_price?: number | null;
  mark_iv?: number | null;
  open_interest?: number | null;
  volume?: number | null;
  underlying_price?: number | null;
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class DeribitAdapter implements ExchangeAdapter {
  name: ExchangeSource = "deribit";

  private async request<T>(
    method: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const url = query
      ? `${DERIBIT_REST}/${method}?${query}`
      : `${DERIBIT_REST}/${method}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) {
      throw new Error(`Deribit HTTP ${resp.status} on ${method}`);
    }
    const json = (await resp.json()) as {
      error?: { message?: string };
      result?: T;
    };
    if (json.error) {
      throw new Error(`Deribit API: ${json.error.message ?? "unknown error"}`);
    }
    if (json.result === undefined) {
      throw new Error(`Deribit API: empty result for ${method}`);
    }
    return json.result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("public/get_time");
      return true;
    } catch {
      return false;
    }
  }

  async fetchUnderlyingPrice(underlying: string): Promise<number> {
    const coin = underlying.toUpperCase();
    const result = await this.request<{ index_price: number }>(
      "public/get_index_price",
      { index_name: `${coin.toLowerCase()}_usd` },
    );
    return asNumber(result.index_price);
  }

  async fetchOptions(underlying: string): Promise<NormalizedOption[]> {
    const coin = underlying.toUpperCase();
    if (coin !== "BTC" && coin !== "ETH") {
      throw new Error(`Unsupported underlying: ${coin}`);
    }

    const [instruments, summaries] = await Promise.all([
      this.request<DeribitInstrument[]>("public/get_instruments", {
        currency: coin,
        kind: "option",
        expired: "false",
      }),
      this.request<BookSummary[]>("public/get_book_summary_by_currency", {
        currency: coin,
        kind: "option",
      }),
    ]);

    const byName = new Map<string, DeribitInstrument>();
    for (const instrument of instruments) {
      if (instrument.kind !== "option" || instrument.is_active === false) continue;
      byName.set(instrument.instrument_name, instrument);
    }

    const options: NormalizedOption[] = [];
    for (const summary of summaries) {
      const instrument = byName.get(summary.instrument_name);
      if (!instrument) continue;
      if (instrument.option_type !== "call" && instrument.option_type !== "put") {
        continue;
      }

      options.push({
        exchange: "deribit",
        symbol: instrument.instrument_name,
        underlying: coin,
        optionType: instrument.option_type,
        strike: asNumber(instrument.strike),
        expiryTimestamp: asNumber(instrument.expiration_timestamp),
        forwardPrice: asNumber(summary.underlying_price),
        markPrice: asNumber(summary.mark_price),
        openInterest: asNumber(summary.open_interest),
        volume24h: asNumber(summary.volume),
        impliedVolatility: asNumber(summary.mark_iv) / 100,
      });
    }

    return options;
  }
}
