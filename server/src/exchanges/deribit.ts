// ============================================================
// Deribit 交易所适配器
// 文档: https://docs.deribit.com/
// 公开 API，无需认证即可获取市场数据
// ============================================================

import { ExchangeAdapter, NormalizedOption, ExchangeSource } from "../types";
import { computeGreeksFromIV } from "../greeks/blackScholes";

const DERIBIT_REST = "https://www.deribit.com/api/v2";

interface DeribitInstrument {
  instrument_name: string;
  option_type: "call" | "put";
  strike: number;
  expiration_timestamp: number;
  min_trade_amount: number;
  quote_currency: string;
  base_currency: string;
  settlement_period: string;
  is_active: boolean;
  kind: string;
}

interface DeribitStats {
  instrument_name: string;
  mark_price: number;
  mark_iv: number;
  open_interest: number;
  volume: number;
  underlying_price: number;
  greeks?: {
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
    rho: number;
  };
}

export class DeribitAdapter implements ExchangeAdapter {
  name: ExchangeSource = "deribit";

  private async request<T>(
    method: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const url = `${DERIBIT_REST}/${method}?${new URLSearchParams(params as any).toString()}`;
    const resp = await fetch(url);
    const json = (await resp.json()) as any;
    if (json.error) {
      throw new Error(`Deribit API Error: ${json.error.message}`);
    }
    return json.result as T;
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
      `public/get_index_price`,
      { index_name: `${coin.toLowerCase()}_usd` },
    );
    return result.index_price;
  }

  async fetchOptions(underlying: string): Promise<NormalizedOption[]> {
    const coin = underlying.toUpperCase();
    const currency = coin === "BTC" ? "BTC" : "ETH";

    // 1. 获取所有期权合约
    const instruments = await this.request<DeribitInstrument[]>(
      "public/get_instruments",
      { currency, kind: "option", expired: "false" },
    );

    if (!instruments || instruments.length === 0) {
      return [];
    }

    // 2. 一次性获取所有期权的统计数据
    // Deribit 的 get_book_summary_by_currency 返回所有活跃期权的行情
    const results: NormalizedOption[] = [];
    const now = Date.now();

    try {
      const bookSummaries = await this.request<any[]>(
        "public/get_book_summary_by_currency",
        { currency, kind: "option" },
      );

      if (!bookSummaries || bookSummaries.length === 0) {
        return [];
      }

      // 创建 instrument name -> instrument 的映射
      const instMap = new Map<string, DeribitInstrument>();
      for (const inst of instruments) {
        instMap.set(inst.instrument_name, inst);
      }

      for (const summary of bookSummaries) {
        const inst = instMap.get(summary.instrument_name);
        if (!inst) continue;

        const daysToExpiry = Math.max(
          (inst.expiration_timestamp - now) / (1000 * 60 * 60 * 24),
          0.01,
        );

        // 使用 Deribit 提供的 Greeks
        let delta = summary.greeks?.delta ?? 0;
        let gamma = summary.greeks?.gamma ?? 0;
        let vega = summary.greeks?.vega ?? 0;
        let theta = summary.greeks?.theta ?? 0;

        if (!summary.greeks && summary.mark_iv > 0) {
          const computed = computeGreeksFromIV(
            summary.underlying_price || 0,
            inst.strike,
            daysToExpiry,
            summary.mark_iv / 100,
            inst.option_type,
          );
          delta = computed.delta;
          gamma = computed.gamma;
          vega = computed.vega;
          theta = computed.theta;
        }

        results.push({
          exchange: "deribit",
          symbol: inst.instrument_name,
          underlying: coin,
          optionType: inst.option_type,
          strike: inst.strike,
          expiryDate: new Date(inst.expiration_timestamp).toISOString(),
          daysToExpiry,
          markPrice: summary.mark_price ?? 0,
          underlyingPrice: summary.underlying_price ?? 0,
          openInterest: summary.open_interest ?? 0,
          volume24h: summary.volume ?? 0,
          impliedVolatility: (summary.mark_iv ?? 0) / 100,
          delta,
          gamma,
          vega,
          theta,
        });
      }
    } catch (err) {
      console.error("Deribit book summary failed:", err);
    }

    return results;
  }
}
