"use strict";
// ============================================================
// GEX Dashboard - 后端 API 服务
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const exchanges_1 = require("./exchanges");
const aggregator_1 = require("./aggregator");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 初始化所有适配器
const adapters = [
    new exchanges_1.DeribitAdapter(),
    new exchanges_1.OkxAdapter(),
    new exchanges_1.BybitAdapter(),
    new exchanges_1.BinanceAdapter(),
];
// ---- API 路由 ----
/** 健康检查 - 检测各交易所连通性 */
app.get("/api/health", async (_req, res) => {
    const results = await Promise.all(adapters.map(async (a) => ({
        exchange: a.name,
        online: await a.healthCheck().catch(() => false),
    })));
    res.json({ success: true, exchanges: results });
});
/** 获取聚合 GEX 数据 */
app.get("/api/gex/:underlying", async (req, res) => {
    const underlying = (req.params.underlying || "BTC").toUpperCase();
    const exchangesParam = req.query.exchanges;
    const exchanges = exchangesParam
        ? exchangesParam.split(",")
        : undefined;
    try {
        const analysis = await (0, aggregator_1.aggregateGex)(adapters, underlying, exchanges);
        const response = {
            success: true,
            data: analysis,
            exchanges: exchanges ?? aggregator_1.ALL_EXCHANGES,
            errors: [],
        };
        // 检查超时或部分失败的交易所
        for (const adapter of adapters) {
            if (exchanges && !exchanges.includes(adapter.name))
                continue;
            if (!analysis.exchangeBreakdown[adapter.name]) {
                response.errors.push({
                    exchange: adapter.name,
                    message: "No data returned",
                });
            }
        }
        res.json(response);
    }
    catch (err) {
        console.error("Aggregation error:", err);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});
/** 按到期日筛选 GEX */
app.get("/api/gex/:underlying/expiry/:expiryDate", async (req, res) => {
    // 简化版：可以在前端按 expiry 过滤
    // 完整实现需要在 aggregator 中支持按到期日分组
    res.json({
        success: true,
        message: "Use /api/gex/:underlying and filter by expiry in client",
    });
});
/** 获取单个交易所的原始数据（调试用） */
app.get("/api/raw/:exchange/:underlying", async (req, res) => {
    const exchange = req.params.exchange;
    const underlying = req.params.underlying.toUpperCase();
    const adapter = adapters.find((a) => a.name === exchange);
    if (!adapter) {
        res
            .status(400)
            .json({ success: false, error: `Unknown exchange: ${exchange}` });
        return;
    }
    try {
        const options = await adapter.fetchOptions(underlying);
        res.json({
            success: true,
            exchange,
            underlying,
            count: options.length,
            data: options,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.listen(PORT, () => {
    console.log(`📊 GEX Dashboard API running on http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`   - GET /api/health              — 交易所连通性检查`);
    console.log(`   - GET /api/gex/BTC             — BTC 聚合 GEX`);
    console.log(`   - GET /api/gex/ETH             — ETH 聚合 GEX`);
    console.log(`   - GET /api/gex/BTC?exchanges=deribit,okx — 指定交易所`);
    console.log(`   - GET /api/raw/deribit/BTC     — 原始数据(调试)`);
});
exports.default = app;
//# sourceMappingURL=index.js.map