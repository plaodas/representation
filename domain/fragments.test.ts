import assert from "node:assert/strict";
import test from "node:test";
import { fragmentsFromSamples, type Sample } from "./fragments.ts";

const fill = (sample: Sample, count: number): Sample[] =>
  Array.from({ length: count }, () => ({ ...sample }));

test("a white page is not a fragment", () => {
  assert.equal(fragmentsFromSamples(fill({ r: 248, g: 248, b: 248 }, 64), 8), null);
});

test("a bright green field becomes plant and summer", () => {
  const fragments = fragmentsFromSamples(fill({ r: 70, g: 170, b: 60 }, 64), 8);
  assert.ok(fragments);
  assert.ok(fragments.see.includes("plant"));
  assert.equal(fragments.season, "summer");
});

test("a dark blue field becomes night", () => {
  const fragments = fragmentsFromSamples(fill({ r: 12, g: 22, b: 70 }, 64), 8);
  assert.ok(fragments);
  assert.ok(fragments.see.includes("night"));
  assert.equal(fragments.see.includes("person"), false);
});
