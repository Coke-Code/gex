import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTermStructure } from "../src/termStructure";

function markerPrice(
  markers: Array<{ id: string; price: number }>,
  id: string,
): number | null {
  return markers.find((marker) => marker.id === id)?.price ?? null;
}

test("term slice Flip marker matches flipPoint", () => {
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
  const slice = slices[0];
  const f = markerPrice(slice.markers, "F");
  if (slice.flipPoint != null) {
    assert.equal(f, slice.flipPoint);
  }
  for (const id of ["P1", "P2", "N1", "N2", "A1", "A2"] as const) {
    const price = markerPrice(slice.markers, id);
    if (price != null) {
      assert.ok(price > 0);
      assert.ok(slice.markers.some((marker) => marker.id === id && marker.price === price));
    }
  }
});
