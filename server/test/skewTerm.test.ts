import test from "node:test";
import assert from "node:assert/strict";
import { pickFrontSkew } from "../src/skewTerm";

test("pickFrontSkew prefers 0.5–10 day expiry", () => {
  const slices = [
    { expiry: "near", days: 0.2, putIv: 0.6, callIv: 0.5, rr: 0.1 },
    { expiry: "front", days: 3, putIv: 0.62, callIv: 0.52, rr: 0.1 },
    { expiry: "far", days: 40, putIv: 0.55, callIv: 0.5, rr: 0.05 },
  ];
  assert.equal(pickFrontSkew(slices)?.expiry, "front");
});
