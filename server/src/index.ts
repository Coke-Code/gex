// ============================================================
// GEX Dashboard - 后端 API 服务 (Deribit)
// ============================================================

import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { DeribitAdapter } from "./exchanges";
import { aggregateGex } from "./aggregator";
import { GexResponse } from "./types";
import { computeGammaSurface, getPredictedZones } from "./greeks/forwardGamma";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 初始化 Deribit 适配器
const deribit = new DeribitAdapter();

// 历史快照缓存（每 5 分钟自动采集）
const MAX_HISTORY = 288; // 24h = 288 × 5min
const historyMap = new Map<
  string,
  {
    timestamp: number;
    flipPoint: number | null;
    totalNetGex: number;
    totalAbsGex: number;
    underlyingPrice: number;
  }[]
>();

// 每 5 分钟自动采集一次快照
const collectSnapshot = async () => {
  for (const coin of ["BTC", "ETH"]) {
    try {
      const analysis = await aggregateGex(deribit, coin);
      const snap = {
        timestamp: analysis.timestamp,
        flipPoint: analysis.flipPoint,
        totalNetGex: analysis.totalNetGex,
        totalAbsGex: analysis.totalAbsGex,
        underlyingPrice: analysis.underlyingPrice,
      };
      if (!historyMap.has(coin)) historyMap.set(coin, []);
      const arr = historyMap.get(coin)!;
      arr.push(snap);
      if (arr.length > MAX_HISTORY) arr.shift();
    } catch {}
  }
};
// 启动时快速采一批模拟历史
(async () => {
  for (let i = 0; i < 10; i++) {
    await collectSnapshot();
    if (i < 9) await new Promise((r) => setTimeout(r, 3000));
  }
})();
setInterval(collectSnapshot, 60 * 1000); // 之后每分钟采集

// ---- API 路由 ----

/** 健康检查 */
app.get("/api/health", async (_req: Request, res: Response) => {
  const online = await deribit.healthCheck().catch(() => false);
  res.json({ success: true, exchanges: [{ exchange: "deribit", online }] });
});

/** 获取 GEX 数据（同时存入历史） */
app.get("/api/gex/:underlying", async (req: Request, res: Response) => {
  const underlying = (req.params.underlying || "BTC").toUpperCase();

  try {
    const analysis = await aggregateGex(deribit, underlying);

    // 每次请求都存快照（去重：5分钟内同一币种只存一次）
    const coin = underlying;
    const arr = historyMap.get(coin) ?? [];
    const last = arr[arr.length - 1];
    if (!last || analysis.timestamp - last.timestamp > 4 * 60 * 1000) {
      arr.push({
        timestamp: analysis.timestamp,
        flipPoint: analysis.flipPoint,
        totalNetGex: analysis.totalNetGex,
        totalAbsGex: analysis.totalAbsGex,
        underlyingPrice: analysis.underlyingPrice,
      });
      if (arr.length > MAX_HISTORY) arr.shift();
      historyMap.set(coin, arr);
    }

    const response: GexResponse = {
      success: true,
      data: analysis,
      exchanges: ["deribit"],
      errors: [],
    };

    if (!analysis.exchangeBreakdown.deribit) {
      response.errors!.push({
        exchange: "deribit",
        message: "No data returned",
      });
    }

    res.json(response);
  } catch (err: any) {
    console.error("Aggregation error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/** 获取历史快照 */
app.get("/api/gex/:underlying/history", (req: Request, res: Response) => {
  const coin = (req.params.underlying || "BTC").toUpperCase();
  const history = historyMap.get(coin) ?? [];
  res.json({ success: true, data: history });
});

/** 获取 Forward Gamma Surface */
app.get("/api/gex/:underlying/surface", async (req: Request, res: Response) => {
  const underlying = (req.params.underlying || "BTC").toUpperCase();

  try {
    const price = await deribit.fetchUnderlyingPrice(underlying);
    const options = await deribit.fetchOptions(underlying);

    // 回填标的价格
    for (const opt of options) {
      if (opt.underlyingPrice === 0) opt.underlyingPrice = price;
    }

    const surface = computeGammaSurface(options, price);
    const predicted = getPredictedZones(surface);

    res.json({ success: true, data: { ...predicted, underlyingPrice: price } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 生产环境：托管前端静态文件 ----

const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  console.log(`📁 Serving static files from ${clientDist}`);
  app.use(express.static(clientDist));
  // SPA fallback — 非 /api 路由全部返回 index.html
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`📊 GEX Dashboard API running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   - GET /api/health              — Deribit 连通性检查`);
  console.log(`   - GET /api/gex/BTC             — BTC GEX 数据`);
  console.log(`   - GET /api/gex/ETH             — ETH GEX 数据`);
});

export default app;
