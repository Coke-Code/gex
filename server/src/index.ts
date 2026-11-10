// BTC 期权看板 API。Deribit、Binance、OKX 能连上的都会算进去。

import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { loadBtc, parseVenue } from "./market";
import { HistorySnap, HistoryStore, pickBaseline } from "./history";
import { useSystemProxy } from "./proxy";
import { GexAnalysis, GexResponse } from "./types";

const app = express();
const PORT = process.env.PORT || 3001;
const CACHE_MS = 15_000;

useSystemProxy();

app.use(cors());
app.use(express.json());
app.use("/api", (req, res, next) => {
  // 行情每次都要带正文。Express 默认 ETag，内容没变就回 304 且正文为空。
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set("Cache-Control", "no-store");
  next();
});

const dataDir = process.env.GEX_DATA_DIR
  ? path.resolve(process.env.GEX_DATA_DIR)
  : path.resolve(__dirname, "../data");
const history = new HistoryStore(path.join(dataDir, "gex-history.json"));

const cache = new Map<string, { at: number; data: GexAnalysis }>();
const inflight = new Map<string, Promise<GexAnalysis>>();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getAnalysis(venueRaw: unknown): Promise<GexAnalysis> {
  const venue = parseVenue(venueRaw);
  const hit = cache.get(venue);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const pending = inflight.get(venue);
  if (pending) return pending;

  const job = loadBtc(venue)
    .then((data) => {
      cache.set(venue, { at: Date.now(), data });
      inflight.delete(venue);
      return data;
    })
    .catch((err) => {
      inflight.delete(venue);
      throw err;
    });
  inflight.set(venue, job);
  return job;
}

function historyLevels(analysis: GexAnalysis) {
  const pick = (id: string) =>
    analysis.markers.find((marker) => marker.id === id)?.price ?? null;
  return { p1: pick("P1"), n1: pick("N1"), a1: pick("A1") };
}

function remember(analysis: GexAnalysis): void {
  if (analysis.venue !== "all" || !(analysis.underlyingPrice > 0)) return;
  history.append("BTC", {
    timestamp: analysis.timestamp,
    flipPoint: analysis.flipPoint,
    totalNetGex: analysis.totalNetGex,
    totalAbsGex: analysis.totalAbsGex,
    underlyingPrice: analysis.underlyingPrice,
    levels: historyLevels(analysis),
    hedgingPressure: analysis.hedgingPressure,
    strikes: analysis.strikes.map((strike) => ({
      strike: strike.strike,
      netGex: strike.netGex,
      oi: strike.oi,
    })),
  });
}

function withBaseline(analysis: GexAnalysis, points: HistorySnap[]): GexAnalysis {
  const base = analysis.venue === "all" ? pickBaseline(points, analysis.timestamp) : null;
  if (!base) {
    return {
      ...analysis,
      change: null,
      strikes: analysis.strikes.map((strike) => ({
        ...strike,
        netThen: null,
        oiThen: null,
      })),
    };
  }
  const past = new Map(base.strikes.map((strike) => [strike.strike, strike]));
  return {
    ...analysis,
    change: {
      timestamp: base.timestamp,
      ageHours: (analysis.timestamp - base.timestamp) / (60 * 60 * 1000),
      flipPoint: base.flipPoint,
      price: base.underlyingPrice,
    },
    strikes: analysis.strikes.map((strike) => {
      const then = past.get(strike.strike);
      const oiThen =
        then != null && Number.isFinite(then.oi) ? (then.oi as number) : null;
      return {
        ...strike,
        netThen: then != null ? then.netGex : null,
        oiThen,
      };
    }),
  };
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ success: true, underlying: "BTC" });
});

app.get("/api/gex/:underlying", async (req: Request, res: Response) => {
  const underlying = String(req.params.underlying || "BTC").toUpperCase();
  if (underlying !== "BTC") {
    res.status(400).json({
      success: false,
      exchanges: [],
      error: "只看 BTC 期权",
    });
    return;
  }

  try {
    const analysis = await getAnalysis(req.query.venue);
    remember(analysis);
    const view = withBaseline(analysis, history.get("BTC"));
    const failed = view.venues.filter(
      (venue) => venue.included && !venue.online && venue.error,
    );
    const response: GexResponse = {
      success: true,
      data: view,
      exchanges: view.venues
        .filter((venue) => venue.online)
        .map((venue) => venue.venue),
      errors: failed.map((venue) => ({
        exchange: venue.venue,
        message: venue.error || "unavailable",
      })),
    };
    res.json(response);
  } catch (err) {
    console.error("Aggregation error:", err);
    res.status(500).json({
      success: false,
      exchanges: [],
      error: errorMessage(err),
    });
  }
});

app.get("/api/gex/:underlying/history", (req: Request, res: Response) => {
  const coin = String(req.params.underlying || "BTC").toUpperCase();
  res.json({ success: true, data: history.get(coin) });
});

const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  console.log(`Serving static files from ${clientDist}`);
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`BTC options API on http://localhost:${PORT}`);
  void getAnalysis("all").then(remember).catch((err) => {
    console.error("Initial snapshot failed:", errorMessage(err));
  });
  setInterval(() => {
    void getAnalysis("all").then(remember).catch((err) => {
      console.error("Snapshot failed:", errorMessage(err));
    });
  }, 5 * 60 * 1000);
});

export default app;
