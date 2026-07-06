"use strict";
// ============================================================
// Binance 交易所适配器
// 文档: https://binance-docs.github.io/apidocs/
// Binance 期权市场相对较小，但在增长
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceAdapter = void 0;
const BINANCE_REST = "https://eapi.binance.com/eapi/v1";
class BinanceAdapter {
    name = "binance";
    async request(path, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = `${BINANCE_REST}${path}${qs ? "?" + qs : ""}`;
        const resp = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "GEX-Dashboard/1.0",
            },
        });
        const json = (await resp.json());
        // Binance 期权 API 的错误处理
        if (json.code && json.code !== 0) {
            throw new Error(`Binance API Error: ${json.msg}`);
        }
        return json;
    }
    async healthCheck() {
        try {
            await this.request("/ping");
            return true;
        }
        catch {
            return false;
        }
    }
    async fetchUnderlyingPrice(underlying) {
        const coin = underlying.toUpperCase();
        try {
            const data = await this.request("/index", {
                underlying: coin,
            });
            return parseFloat(data[0]?.indexPrice ?? "0");
        }
        catch {
            return 0;
        }
    }
    async fetchOptions(underlying) {
        const coin = underlying.toUpperCase();
        try {
            // 获取期权合约列表
            const instruments = await this.request("/optionInfo", {
                underlying: coin,
            });
            if (!instruments || instruments.length === 0)
                return [];
            const results = [];
            // 分批获取行情数据
            const batchSize = 50;
            for (let i = 0; i < instruments.length; i += batchSize) {
                const batch = instruments.slice(i, i + batchSize);
                const symbols = batch.map((b) => b.symbol).join(",");
                try {
                    // 并行获取 mark price 和 OI
                    const [markData, oiData] = await Promise.all([
                        this.request("/mark", { symbol: symbols }),
                        this.request("/openInterest", { symbol: symbols }),
                    ]);
                    for (let j = 0; j < batch.length; j++) {
                        const inst = batch[j];
                        const mark = Array.isArray(markData)
                            ? markData.find((m) => m.symbol === inst.symbol)
                            : null;
                        const oi = Array.isArray(oiData)
                            ? oiData.find((o) => o.symbol === inst.symbol)
                            : null;
                        if (!mark)
                            continue;
                        const strike = parseFloat(inst.strikePrice);
                        const daysToExpiry = Math.max((inst.expiryDate - Date.now()) / (1000 * 60 * 60 * 24), 0.01);
                        results.push({
                            exchange: "binance",
                            symbol: inst.symbol,
                            underlying: coin,
                            optionType: inst.side === "CALL" ? "call" : "put",
                            strike,
                            expiryDate: new Date(inst.expiryDate).toISOString(),
                            daysToExpiry,
                            markPrice: parseFloat(mark.markPrice || "0"),
                            underlyingPrice: 0,
                            openInterest: parseFloat(oi?.sumOpenInterest ?? "0"),
                            volume24h: parseFloat(oi?.volume ?? "0"),
                            impliedVolatility: parseFloat(mark.iv || "0"),
                            delta: parseFloat(mark.delta || "0"),
                            gamma: parseFloat(mark.gamma || "0"),
                            vega: parseFloat(mark.vega || "0"),
                            theta: parseFloat(mark.theta || "0"),
                        });
                    }
                }
                catch (err) {
                    console.error(`Binance batch ${i} failed:`, err);
                }
            }
            return results;
        }
        catch (err) {
            console.error("Binance fetchOptions failed:", err);
            return [];
        }
    }
}
exports.BinanceAdapter = BinanceAdapter;
//# sourceMappingURL=binance.js.map