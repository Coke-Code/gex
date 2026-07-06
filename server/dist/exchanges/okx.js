"use strict";
// ============================================================
// OKX 交易所适配器
// 文档: https://www.okx.com/docs-v5/
// 公开市场数据 API
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.OkxAdapter = void 0;
const OKX_REST = "https://www.okx.com/api/v5";
class OkxAdapter {
    name = "okx";
    async request(path, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = `${OKX_REST}${path}${qs ? "?" + qs : ""}`;
        const resp = await fetch(url);
        const json = (await resp.json());
        if (json.code !== "0") {
            throw new Error(`OKX API Error: ${json.msg}`);
        }
        return json.data;
    }
    async healthCheck() {
        try {
            await this.request("/public/time");
            return true;
        }
        catch {
            return false;
        }
    }
    async fetchUnderlyingPrice(underlying) {
        const coin = underlying.toUpperCase();
        const data = await this.request("/market/index-tickers", { instId: `${coin}-USD` });
        return parseFloat(data[0]?.idxPx ?? "0");
    }
    async fetchOptions(underlying) {
        const coin = underlying.toUpperCase();
        const uly = `${coin}-USD`;
        // 1. 获取期权合约列表（按标的资产）
        const instruments = await this.request("/public/instruments", { instType: "OPTION", uly });
        if (!instruments || instruments.length === 0) {
            return [];
        }
        // 过滤掉非活跃状态
        const active = instruments.filter((i) => i.state === "live");
        // 2. 获取期权 Greeks + OI（可计算 GEX）
        const summaries = await this.request("/public/opt-summary", {
            uly,
        });
        const openInterests = await this.request("/public/open-interest", {
            instType: "OPTION",
            uly,
        });
        const summaryMap = new Map();
        for (const s of summaries) {
            // opt-summary 的 instId 可能是 BTC-USD_UM-...，统一成 BTC-USD-...
            const normalizedId = s.instId.replace("_UM", "");
            summaryMap.set(normalizedId, s);
        }
        const oiMap = new Map();
        for (const oi of openInterests) {
            oiMap.set(oi.instId, oi);
        }
        const results = [];
        for (const inst of active) {
            const summary = summaryMap.get(inst.instId);
            const oi = oiMap.get(inst.instId);
            if (!summary)
                continue;
            // OKX instruments 返回字段名是 stk，不是 strike
            const strike = parseFloat(inst.stk ?? inst.strike);
            const expTimestamp = parseInt(inst.expTime);
            const daysToExpiry = Math.max((expTimestamp - Date.now()) / (1000 * 60 * 60 * 24), 0.01);
            // OKX 提供的 Greeks（BS模型）
            const delta = parseFloat(summary.deltaBS || summary.delta || "0");
            const gamma = parseFloat(summary.gammaBS || summary.gamma || "0");
            const vega = parseFloat(summary.vegaBS || summary.vega || "0");
            const theta = parseFloat(summary.thetaBS || summary.theta || "0");
            results.push({
                exchange: "okx",
                symbol: inst.instId,
                underlying: coin,
                optionType: inst.optType === "C" ? "call" : "put",
                strike,
                expiryDate: new Date(expTimestamp).toISOString(),
                daysToExpiry,
                markPrice: 0,
                underlyingPrice: 0, // 会由 aggregator 统一填充
                openInterest: parseFloat(oi?.oi || "0"),
                volume24h: 0,
                impliedVolatility: parseFloat(summary.markVol || "0"),
                delta,
                gamma,
                vega,
                theta,
            });
        }
        return results;
    }
}
exports.OkxAdapter = OkxAdapter;
//# sourceMappingURL=okx.js.map