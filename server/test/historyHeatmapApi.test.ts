import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHeatmapPayload, downsampleHourly } from "../src/historyHeatmapApi";
import { HistorySnap } from "../src/history";
import { HEATMAP_BUCKET_MS } from "../src/historyTypes";

const snap = (ts: number, price: number, strike: number, netGex: number): HistorySnap => ({
  timestamp: ts,
  flipPoint: price - 1000,
  totalNetGex: netGex,
  totalAbsGex: Math.abs(netGex),
  underlyingPrice: price,
  strikes: [{ strike, netGex }],
});

test("downsampleHourly keeps the newest point per bucket", () => {
  const base = 1_700_000_000_000;
  const points = [
    snap(base, 100_000, 100_000, 1),
    snap(base + 5 * 60_000, 100_000, 100_000, 2),
    snap(base + HEATMAP_BUCKET_MS, 101_000, 101_000, 3),
  ];
  const out = downsampleHourly(points);
  assert.equal(out.length, 2);
  assert.equal(out[0].timestamp, base + 5 * 60_000);
  assert.equal(out[1].timestamp, base + HEATMAP_BUCKET_MS);
});

test("buildHeatmapPayload returns columnar z", () => {
  const base = 1_700_000_000_000;
  const points = [
    {
      ...snap(base, 100_000, 98_000, -1),
      strikes: [
        { strike: 98_000, netGex: -1 },
        { strike: 102_000, netGex: 2 },
      ],
    },
    {
      ...snap(base + HEATMAP_BUCKET_MS, 100_500, 98_500, -2),
      strikes: [
        { strike: 98_500, netGex: -3 },
        { strike: 102_500, netGex: 4 },
      ],
    },
  ];
  const payload = buildHeatmapPayload(points);
  assert.ok(payload);
  assert.equal(payload!.t.length, 2);
  assert.equal(payload!.p.length, 2);
  assert.equal(payload!.k.length, payload!.z.length);
  assert.equal(payload!.z[0].length, 2);
});