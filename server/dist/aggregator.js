"use strict";
// ============================================================
// 多交易所数据聚合器
// 将各平台数据归一化后聚合为统一的 GEX 视图
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_EXCHANGES = void 0;
exports.aggregateGex = aggregateGex;
const blackScholes_1 = require("./greeks/blackScholes");
const ALL_EXCHANGES = ["deribit", "okx", "bybit", "binance"];
exports.ALL_EXCHANGES = ALL_EXCHANGES;
/**
 * 从各交易所拉取并聚合数据
 */
async function aggregateGex(adapters, underlying, enabledExchanges) {
    const exchanges = enabledExchanges ?? ALL_EXCHANGES;
    const activeAdapters = adapters.filter((a) => exchanges.includes(a.name));
    // 1. 并行从各交易所拉取数据
    const exchangeResults = await Promise.allSettled(activeAdapters.map(async (adapter) => {
        const price = await adapter.fetchUnderlyingPrice(underlying);
        const options = await adapter.fetchOptions(underlying);
        // 回填标的价格
        for (const opt of options) {
            if (opt.underlyingPrice === 0) {
                opt.underlyingPrice = price;
            }
        }
        return { exchange: adapter.name, options, price };
    }));
    // 2. 收集所有期权数据
    const allOptions = [];
    const exchangeBreakdown = {};
    const errors = [];
    let weightedPrice = 0;
    let totalWeight = 0;
    for (const result of exchangeResults) {
        if (result.status === "fulfilled") {
            const { exchange, options, price } = result.value;
            allOptions.push(...options);
            let totalGex = 0;
            for (const opt of options) {
                const gex = (0, blackScholes_1.computeGEX)(opt.gamma, opt.openInterest, opt.strike, 1, price);
                totalGex += gex * (opt.optionType === "call" ? 1 : -1);
            }
            exchangeBreakdown[exchange] = {
                totalNetGex: totalGex,
                optionCount: options.length,
                totalOI: options.reduce((sum, o) => sum + o.openInterest, 0),
            };
            if (price > 0) {
                weightedPrice += price * options.length;
                totalWeight += options.length;
            }
        }
        else {
            const exchangeName = activeAdapters[exchangeResults.indexOf(result)]?.name ?? "unknown";
            errors.push({
                exchange: exchangeName,
                message: result.reason?.message ?? "Unknown error",
            });
        }
    }
    const underlyingPrice = totalWeight > 0 ? weightedPrice / totalWeight : 0;
    // 3. 按行权价聚合
    const strikeMap = new Map();
    for (const opt of allOptions) {
        if (!strikeMap.has(opt.strike)) {
            strikeMap.set(opt.strike, {
                strike: opt.strike,
                callGex: 0,
                putGex: 0,
                netGex: 0,
                absGex: 0,
                breakdown: {},
            });
        }
        const entry = strikeMap.get(opt.strike);
        const gex = (0, blackScholes_1.computeGEX)(opt.gamma, opt.openInterest, opt.strike, 1, opt.underlyingPrice);
        if (opt.optionType === "call") {
            entry.callGex += gex;
        }
        else {
            entry.putGex += gex;
        }
        if (!entry.breakdown[opt.exchange]) {
            entry.breakdown[opt.exchange] = { callGex: 0, putGex: 0, oi: 0 };
        }
        const bd = entry.breakdown[opt.exchange];
        if (opt.optionType === "call") {
            bd.callGex += gex;
        }
        else {
            bd.putGex += gex;
        }
        bd.oi += opt.openInterest;
    }
    // 4. 计算每个行权价的 net/abs GEX
    for (const [, entry] of strikeMap) {
        entry.netGex = entry.callGex - entry.putGex;
        entry.absGex = Math.abs(entry.callGex) + Math.abs(entry.putGex);
    }
    // 5. 排序
    const strikes = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);
    // 6. 计算汇总指标
    const totalNetGex = strikes.reduce((sum, s) => sum + s.netGex, 0);
    const totalAbsGex = strikes.reduce((sum, s) => sum + s.absGex, 0);
    // 7. Flip Point: Net GEX 由正转负的行权价区间
    let flipPoint = null;
    let flipZone = null;
    for (let i = 1; i < strikes.length; i++) {
        if (strikes[i - 1].netGex > 0 && strikes[i].netGex < 0) {
            flipPoint = (strikes[i - 1].strike + strikes[i].strike) / 2;
            flipZone = { low: strikes[i - 1].strike, high: strikes[i].strike };
            break;
        }
        if (strikes[i - 1].netGex < 0 && strikes[i].netGex > 0) {
            flipPoint = (strikes[i - 1].strike + strikes[i].strike) / 2;
            flipZone = { low: strikes[i - 1].strike, high: strikes[i].strike };
            break;
        }
    }
    // 8. 对冲压力：当前价格附近的 Gamma 方向
    const nearbyStrikes = strikes.filter((s) => s.strike >= underlyingPrice * 0.95 && s.strike <= underlyingPrice * 1.05);
    const nearbyNet = nearbyStrikes.reduce((sum, s) => sum + s.netGex, 0);
    let hedgingPressure = "neutral";
    if (nearbyNet > totalAbsGex * 0.05)
        hedgingPressure = "positive";
    else if (nearbyNet < -totalAbsGex * 0.05)
        hedgingPressure = "negative";
    // 9. 每1%波动的净 GEX
    const gexPer1PctMove = totalNetGex * 0.01;
    return {
        underlying,
        underlyingPrice,
        timestamp: Date.now(),
        strikes,
        totalNetGex,
        totalAbsGex,
        flipPoint,
        flipZone,
        hedgingPressure,
        gexPer1PctMove,
        exchangeBreakdown,
    };
}
//# sourceMappingURL=aggregator.js.map