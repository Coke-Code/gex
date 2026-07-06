"use strict";
// ============================================================
// Bybit 交易所适配器
// 文档: https://bybit-exchange.github.io/docs/v5/
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitAdapter = void 0;
const BYBIT_REST = "https://api.bybit.com/v5";
class BybitAdapter {
    name = "bybit";
    async request(path, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = `${BYBIT_REST}${path}${qs ? "?" + qs : ""}`;
        const resp = await fetch(url);
        const json = (await resp.json());
        if (json.retCode !== 0) {
            throw new Error(`Bybit API Error: ${json.retMsg}`);
        }
        return json.result;
    }
    async healthCheck() {
        try {
            await this.request("/market/time");
            return true;
        }
        catch {
            return false;
        }
    }
    async fetchUnderlyingPrice(underlying) {
        const coin = underlying.toUpperCase();
        const data = await this.request("/market/tickers", { category: "spot", symbol: `${coin}USDT` });
        return parseFloat(data.list?.[0]?.indexPrice ?? "0");
    }
    async fetchOptions(underlying) {
        const coin = underlying.toUpperCase();
        try {
            // Bybit 期权合约列表
            const instResult = await this.request("/market/instruments-info", { category: "option", baseCoin: coin });
            const instruments = instResult.list?.filter((i) => i.status === "Trading") ?? [];
            if (instruments.length === 0)
                return [];
            const results = [];
            // 获取行情数据（Bybit 支持批量，但限制50个）
            const batchSize = 50;
            for (let i = 0; i < instruments.length; i += batchSize) {
                const batch = instruments.slice(i, i + batchSize);
                const symbols = batch.map((b) => b.symbol).join(",");
                try {
                    const tickerResult = await this.request("/market/tickers", { category: "option", symbol: symbols });
                    for (let j = 0; j < batch.length; j++) {
                        const inst = batch[j];
                        const ticker = tickerResult.list?.find((t) => t.symbol === inst.symbol);
                        if (!ticker)
                            continue;
                        const strike = parseFloat(inst.strikePrice);
                        const expTimestamp = parseInt(inst.deliveryTime);
                        const daysToExpiry = Math.max((expTimestamp - Date.now()) / (1000 * 60 * 60 * 24), 0.01);
                        results.push({
                            exchange: "bybit",
                            symbol: inst.symbol,
                            underlying: coin,
                            optionType: inst.optionsType === "Call" ? "call" : "put",
                            strike,
                            expiryDate: new Date(expTimestamp).toISOString(),
                            daysToExpiry,
                            markPrice: parseFloat(ticker.markPrice || "0"),
                            underlyingPrice: 0,
                            openInterest: parseFloat(ticker.openInterest || "0"),
                            volume24h: parseFloat(ticker.volume24h || "0"),
                            impliedVolatility: parseFloat(ticker.iv || "0"),
                            delta: parseFloat(ticker.delta || "0"),
                            gamma: parseFloat(ticker.gamma || "0"),
                            vega: parseFloat(ticker.vega || "0"),
                            theta: parseFloat(ticker.theta || "0"),
                        });
                    }
                }
                catch (err) {
                    console.error(`Bybit batch ${i} failed:`, err);
                }
            }
            return results;
        }
        catch (err) {
            console.error("Bybit fetchOptions failed:", err);
            return [];
        }
    }
}
exports.BybitAdapter = BybitAdapter;
//# sourceMappingURL=bybit.js.map