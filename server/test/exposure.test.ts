import test from "node:test";
import assert from "node:assert/strict";
import {
  black76Delta,
  black76Gamma,
  normalPdf,
  yearFraction,
  MS_PER_YEAR,
} from "../src/greeks/black76";
import { coinOpenInterest, decimalIv } from "../src/exchanges/units";
import {
  aggregateStrikes,
  buildGammaCurve,
  dollarGex,
  findZeroGamma,
  netGexAtSpot,
} from "../src/greeks/exposure";
import { analyzeChain, oneDayMove } from "../src/analysis";
import { chartMarkers } from "../src/markers";
import { pickBaseline } from "../src/history";
import { NormalizedOption } from "../src/types";

test("ATM Black-76 gamma matches φ(d1) / (F σ √T)", () => {
  const forward = 100_000;
  const strike = 100_000;
  const timeYears = 30 / 365;
  const iv = 0.5;
  const sqrtT = Math.sqrt(timeYears);
  const d1 = (0.5 * iv * iv * timeYears) / (iv * sqrtT);
  const expected = normalPdf(d1) / (forward * iv * sqrtT);
  const gamma = black76Gamma(forward, strike, timeYears, iv);
  assert.ok(Math.abs(gamma - expected) / expected < 1e-12);
  assert.ok(gamma > 2.7e-5 && gamma < 2.85e-5);
});

test("call and put dollar GEX are opposite and scale as Γ·OI·F²·0.01", () => {
  const base = {
    strike: 100_000,
    openInterest: 1_000,
    iv: 0.5,
    forward: 100_000,
    timeYears: 30 / 365,
  };
  const call = dollarGex({ ...base, optionType: "call" });
  const put = dollarGex({ ...base, optionType: "put" });
  const gamma = black76Gamma(base.forward, base.strike, base.timeYears, base.iv);
  const expected = gamma * base.openInterest * base.forward * base.forward * 0.01;
  assert.ok(Math.abs(call - expected) / expected < 1e-12);
  assert.ok(Math.abs(call + put) < 1e-6);
  assert.ok(call > 0 && put < 0);
});

test("intraday expiry is not flattened to one day", () => {
  const twoHours = 2 / 24 / 365;
  const oneDay = 1 / 365;
  const shortDated = black76Gamma(100, 100, twoHours, 0.6);
  const oneDayGamma = black76Gamma(100, 100, oneDay, 0.6);
  assert.ok(shortDated > oneDayGamma * 3);
  assert.equal(black76Gamma(100, 100, 0, 0.6), 0);
  assert.equal(yearFraction(1_000, 1_000), 0);
  const now = 1_700_000_000_000;
  const inTwoHours = now + twoHours * MS_PER_YEAR;
  assert.ok(Math.abs(yearFraction(inTwoHours, now) - twoHours) < 1e-12);
});

test("repricing at the same spot matches the snapshot sum", () => {
  const contracts = [
    {
      strike: 110,
      optionType: "call" as const,
      openInterest: 5,
      iv: 0.55,
      forward: 102,
      timeYears: 20 / 365,
    },
    {
      strike: 90,
      optionType: "put" as const,
      openInterest: 8,
      iv: 0.6,
      forward: 101,
      timeYears: 7 / 365,
    },
  ];
  const snapshot = contracts.reduce((sum, contract) => sum + dollarGex(contract), 0);
  assert.ok(Math.abs(netGexAtSpot(contracts, 100, 100) - snapshot) < 1e-8);
});

test("zero gamma is the spot crossing closest to the index, not a strike average", () => {
  const contracts = [
    {
      strike: 120,
      optionType: "call" as const,
      openInterest: 10,
      iv: 0.5,
      forward: 100,
      timeYears: 30 / 365,
    },
    {
      strike: 80,
      optionType: "put" as const,
      openInterest: 10,
      iv: 0.5,
      forward: 100,
      timeYears: 30 / 365,
    },
  ];
  assert.ok(netGexAtSpot(contracts, 100, 80) < 0);
  assert.ok(netGexAtSpot(contracts, 100, 120) > 0);
  const curve = buildGammaCurve(contracts, 100);
  const zero = findZeroGamma(curve, 100);
  assert.ok(zero);
  assert.ok(zero.flipPoint > 90 && zero.flipPoint < 110);
  assert.ok(zero.flipZone.low <= zero.flipPoint);
  assert.ok(zero.flipZone.high >= zero.flipPoint);
});

test("strike net is call minus put, and bad quotes are dropped", () => {
  const rows = aggregateStrikes([
    { strike: 100, optionType: "call", gex: 30, openInterest: 2 },
    { strike: 100, optionType: "put", gex: -10, openInterest: 1 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].callGex, 30);
  assert.equal(rows[0].putGex, 10);
  assert.equal(rows[0].netGex, 20);
  assert.equal(rows[0].absGex, 40);

  const now = 1_700_000_000_000;
  const valid: NormalizedOption = {
    exchange: "deribit",
    symbol: "BTC-TEST-100-C",
    underlying: "BTC",
    optionType: "call",
    strike: 100,
    expiryTimestamp: now + 10 * 24 * 60 * 60 * 1000,
    forwardPrice: 100,
    markPrice: 0.01,
    openInterest: 4,
    volume24h: 1,
    impliedVolatility: 0.5,
  };
  const analysis = analyzeChain({
    underlying: "BTC",
    indexPrice: 100,
    nowMs: now,
    options: [
      valid,
      { ...valid, symbol: "expired", expiryTimestamp: now - 1000 },
      { ...valid, symbol: "no-oi", openInterest: 0 },
      { ...valid, symbol: "bad-iv", impliedVolatility: 0 },
      { ...valid, symbol: "bad-forward", forwardPrice: 0 },
    ],
  });
  assert.equal(analysis.quality.contractsSeen, 5);
  assert.equal(analysis.quality.contractsUsed, 1);
  assert.equal(analysis.quality.dropped.expired, 1);
  assert.equal(analysis.quality.dropped.noOpenInterest, 1);
  assert.equal(analysis.quality.dropped.badIv, 1);
  assert.equal(analysis.quality.dropped.badPrice, 1);
  assert.equal(analysis.strikes.length, 1);
  assert.ok(analysis.totalNetGex > 0);
  assert.equal(analysis.hedgingPressure, "positive");
  assert.equal(analysis.gammaCurve.length, 121);
});

test("levels, tenor and 25-delta skew come off the same chain", () => {
  const now = 1_700_000_000_000;
  const near = now + 7 * 24 * 60 * 60 * 1000;
  const far = now + 30 * 24 * 60 * 60 * 1000;
  const option = (
    partial: Partial<NormalizedOption> & Pick<NormalizedOption, "symbol" | "strike" | "optionType" | "expiryTimestamp">,
  ): NormalizedOption => ({
    exchange: "deribit",
    underlying: "BTC",
    forwardPrice: 100,
    markPrice: 1,
    openInterest: 10,
    volume24h: 1,
    impliedVolatility: partial.optionType === "put" ? 0.7 : 0.5,
    ...partial,
  });

  const analysis = analyzeChain({
    underlying: "BTC",
    indexPrice: 100,
    nowMs: now,
    options: [
      option({ symbol: "near-c", strike: 110, optionType: "call", expiryTimestamp: near, impliedVolatility: 0.45 }),
      option({ symbol: "near-p", strike: 90, optionType: "put", expiryTimestamp: near, impliedVolatility: 0.75 }),
      option({ symbol: "atm-c", strike: 100, optionType: "call", expiryTimestamp: near, impliedVolatility: 0.5 }),
      option({ symbol: "atm-p", strike: 100, optionType: "put", expiryTimestamp: near, impliedVolatility: 0.62 }),
      option({ symbol: "far-c", strike: 130, optionType: "call", expiryTimestamp: far, exchange: "okx", openInterest: 4 }),
    ],
  });

  assert.equal(analysis.levels.support?.strike, 90);
  assert.equal(analysis.levels.resistance?.strike, 110);
  assert.equal(analysis.expiries.length, 2);
  assert.ok(analysis.expiries[0].days < analysis.expiries[1].days);
  assert.ok(analysis.expiries[0].atmIv && analysis.expiries[0].atmIv > 0.5);
  assert.ok(analysis.speed.hedgeUsdPer1Pct !== 0);
  assert.equal(analysis.exchangeBreakdown.okx?.optionCount, 1);
  assert.equal(analysis.venues.length, 3);
  const callDelta = black76Delta(100, 100, 30 / 365, 0.5, "call");
  assert.ok(callDelta > 0.5 && callDelta < 0.6);
  assert.ok(black76Delta(100, 100, 30 / 365, 0.5, "put") < 0);
});

test("a strike splits by expiry, and missing volume stays partial", () => {
  const now = 1_700_000_000_000;
  const near = now + 2 * 24 * 60 * 60 * 1000;
  const far = now + 30 * 24 * 60 * 60 * 1000;
  const option = (
    partial: Partial<NormalizedOption> & Pick<NormalizedOption, "symbol" | "expiryTimestamp" | "exchange">,
  ): NormalizedOption => ({
    underlying: "BTC",
    optionType: "call",
    strike: 100,
    forwardPrice: 100,
    markPrice: 1,
    openInterest: 2,
    volume24h: 1,
    impliedVolatility: 0.5,
    ...partial,
  });
  const analysis = analyzeChain({
    underlying: "BTC",
    indexPrice: 100,
    nowMs: now,
    options: [
      option({ symbol: "near", expiryTimestamp: near, exchange: "deribit", volume24h: 1.5, openInterest: 3 }),
      option({ symbol: "far", expiryTimestamp: far, exchange: "okx", volume24h: null, openInterest: 4 }),
    ],
  });
  const strike = analysis.strikes[0];
  assert.equal(strike.byExpiry.length, 2);
  assert.ok(strike.byExpiry[0].days < strike.byExpiry[1].days);
  assert.ok(strike.byExpiry[0].netGex > 0);
  assert.equal(strike.oi, 7);
  assert.equal(strike.volume, 1.5);
  assert.equal(strike.volumePartial, true);
  assert.ok(analysis.move);
  assert.ok(Math.abs(analysis.move.oneDay - oneDayMove(100, analysis.move.iv)) < 1e-9);
  assert.ok(analysis.move.oneDay > 0);
});

test("baseline is the real snapshot closest to four hours ago", () => {
  const now = 1_000_000_000_000;
  const point = (ageMin: number) => ({
    timestamp: now - ageMin * 60 * 1000,
    flipPoint: 90,
    totalNetGex: 1,
    totalAbsGex: 2,
    underlyingPrice: 100,
    strikes: [],
  });
  assert.equal(pickBaseline([point(10), point(20)], now), null);
  const chosen = pickBaseline([point(10), point(30), point(240), point(600)], now);
  assert.equal(chosen?.timestamp, now - 240 * 60 * 1000);
  const withStrikes = {
    ...point(40),
    strikes: [{ strike: 100, netGex: 5 }],
  };
  assert.equal(pickBaseline([point(240), withStrikes], now)?.timestamp, withStrikes.timestamp);
});

test("chart markers follow peaks, the forecast curve, and confluence", () => {
  const strikes = [
    { strike: 90, netGex: -8, absGex: 10 },
    { strike: 100, netGex: -30, absGex: 50 },
    { strike: 105, netGex: -12, absGex: 14 },
    { strike: 110, netGex: 40, absGex: 42 },
    { strike: 112, netGex: 25, absGex: 28 },
    { strike: 120, netGex: 4, absGex: 6 },
    { strike: 130, netGex: 15, absGex: 16 },
  ];
  const curve = [
    { spot: 90, totalNetGex: -5 },
    { spot: 95, totalNetGex: -20 },
    { spot: 100, totalNetGex: -4 },
    { spot: 105, totalNetGex: 30 },
    { spot: 110, totalNetGex: 8 },
    { spot: 115, totalNetGex: 9 },
    { spot: 120, totalNetGex: 4 },
  ];
  const markers = chartMarkers(strikes, curve, 102, 100);
  const at = (id: string) => markers.find((marker) => marker.id === id);
  assert.equal(at("P1")?.price, 110);
  assert.equal(at("P2")?.price, 130);
  assert.equal(at("N1")?.price, 100);
  assert.equal(at("N2")?.price, 105);
  assert.equal(at("A1")?.price, 100);
  assert.equal(at("A2")?.price, 110);
  assert.equal(at("F")?.price, 102);
  assert.equal(at("S")?.price, 105);
  assert.equal(at("V")?.price, 95);
  assert.equal(at("GC")?.price, 102.5);
  assert.equal(at("N1")?.confluence, true);
  assert.equal(at("A1")?.confluence, true);
  assert.equal(at("P1")?.confluence, true);
  assert.equal(at("A2")?.confluence, true);
  assert.equal(at("P2")?.confluence, false);
  assert.equal(at("N2")?.confluence, true);
  assert.equal(at("S")?.confluence, true);
  assert.equal(at("V")?.confluence, false);
  assert.equal(at("F")?.confluence, true);
  assert.equal(at("GC")?.confluence, true);

  const smooth = Array.from({ length: 30 }, (_, i) => ({ spot: 100 + i, totalNetGex: i }));
  const quiet = chartMarkers([], smooth, null, 110);
  assert.equal(quiet.find((marker) => marker.kind === "S"), undefined);
  assert.equal(quiet.find((marker) => marker.kind === "V"), undefined);
  assert.equal(quiet.find((marker) => marker.kind === "GC"), undefined);
});

test("contract size and iv scale", () => {
  assert.equal(coinOpenInterest(100, 0.01), 1);
  assert.equal(coinOpenInterest(0, 1), 0);
  assert.equal(decimalIv(55), 0.55);
  assert.equal(decimalIv(0.55), 0.55);
});
