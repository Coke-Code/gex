import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTermStructure, maxPain } from "../src/termStructure";

test("maxPain picks minimum payout strike", () => {
  const pain = maxPain([
    { strike: 100, optionType: "call", openInterest: 10 },
    { strike: 100, optionType: "put", openInterest: 5 },
    { strike: 110, optionType: "call", openInterest: 8 },
  ]);
  assert.equal(pain, 100);
});

test("buildTermStructure returns slices with markers", () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const expiry = Date.UTC(2026, 1, 28, 8, 0, 0);
  const rows = [
    { strike: 95_000, optionType: "call" as const, openInterest: 120, gex: 2e6, timeYears: 0.12, impliedVolatility: 0.55, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
    { strike: 95_000, optionType: "put" as const, openInterest: 80, gex: -1e6, timeYears: 0.12, impliedVolatility: 0.58, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
    { strike: 100_000, optionType: "call" as const, openInterest: 200, gex: 3e6, timeYears: 0.12, impliedVolatility: 0.52, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
    { strike: 100_000, optionType: "put" as const, openInterest: 150, gex: -2e6, timeYears: 0.12, impliedVolatility: 0.54, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
    { strike: 105_000, optionType: "call" as const, openInterest: 90, gex: 1e6, timeYears: 0.12, impliedVolatility: 0.57, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
    { strike: 105_000, optionType: "put" as const, openInterest: 60, gex: -0.8e6, timeYears: 0.12, impliedVolatility: 0.59, forwardPrice: 100_000, expiryTimestamp: expiry, exchange: "deribit" as const },
  ];
  const slices = buildTermStructure({
    options: rows,
    indexPrice: 100_000,
    nowMs: now,
    expectedVenues: ["deribit", "binance", "okx"],
  });
  assert.equal(slices.length, 1);
  assert.ok(slices[0].contractsUsed >= 4);
  assert.ok(slices[0].maxPain != null);
  assert.ok(Array.isArray(slices[0].markers));
  assert.match(slices[0].qualityNote ?? "", /OI 有延迟/);
});
