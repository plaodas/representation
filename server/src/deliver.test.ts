import assert from "node:assert/strict";
import test from "node:test";
import { deliveryOf } from "./deliver.ts";

const zone = "Asia/Tokyo";

test("a morning order is delivered at 18:00 the same day", () => {
  const delivery = deliveryOf({
    now: new Date("2026-10-01T01:00:00.000Z"),
    timeZone: zone,
    localDate: "2026-10-01",
    immediate: false,
  });
  assert.deepEqual(delivery, {
    localDate: "2026-10-01",
    deliverAt: "2026-10-01T09:00:00.000Z",
  });
});

test("an order after 15:00 waits until 18:00 the next day", () => {
  const delivery = deliveryOf({
    now: new Date("2026-10-01T07:10:00.000Z"),
    timeZone: zone,
    localDate: "2026-10-01",
    immediate: false,
  });
  assert.deepEqual(delivery, {
    localDate: "2026-10-02",
    deliverAt: "2026-10-02T09:00:00.000Z",
  });
});

test("the local switch delivers the row now", () => {
  const now = new Date("2026-10-01T07:10:00.000Z");
  const delivery = deliveryOf({
    now,
    timeZone: zone,
    localDate: "2026-10-01",
    immediate: true,
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
      immediate: false,
    }),
    null,
  );
});
