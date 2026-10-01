import assert from "node:assert/strict";
import test from "node:test";
import { deliveryOf, orderAllowed } from "./deliver.ts";

const zone = "Asia/Tokyo";

test("today's order is delivered now", () => {
  const now = new Date("2026-10-01T07:10:00.000Z");
  const delivery = deliveryOf({
    now,
    timeZone: zone,
    localDate: "2026-10-01",
  });
  assert.deepEqual(delivery, {
    localDate: "2026-10-01",
    deliverAt: now.toISOString(),
  });
});

test("a date that is not today is refused", () => {
  assert.equal(
    deliveryOf({
      now: new Date("2026-10-01T01:00:00.000Z"),
      timeZone: zone,
      localDate: "2026-09-30",
    }),
    null,
  );
});

test("a daily limit of one refuses a row that already exists", () => {
  assert.equal(orderAllowed(true, 1), false);
  assert.equal(orderAllowed(false, 1), true);
});

test("a daily limit of zero replaces the same day", () => {
  assert.equal(orderAllowed(true, 0), true);
});
