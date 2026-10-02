import assert from "node:assert/strict";
import test from "node:test";
import { carryText, mergeCarry, parseCarry, type Carry, type CarryPoem } from "./carry.ts";
import { emptyRead } from "./types.ts";

const poem = (partial: Partial<CarryPoem> & Pick<CarryPoem, "day" | "body">): CarryPoem => ({
  lang: "ja",
  seen: true,
  see: [],
  reason: "",
  scene: false,
  explains: false,
  missed: false,
  ...partial,
});

const empty = (partial: Partial<Carry> = {}): Carry => ({
  reactions: [],
  reading: {},
  form: "free",
  lang: "mix",
  arrived: [],
  ...partial,
});

test("a carry file leaves out the blurred photo", () => {
  const text = carryText(empty({
    arrived: [poem({ day: "2026-10-02", body: "夜", thumb: "data:image/jpeg,abc" })],
  }));
  const parsed = JSON.parse(text) as { arrived: CarryPoem[]; orderToken?: string };
  assert.equal(parsed.arrived[0]?.thumb, undefined);
  assert.equal(parsed.orderToken, undefined);
});

test("a newer own poem replaces the same id and a missing day is added", () => {
  const device = empty({
    arrived: [
      poem({ id: "own", day: "2026-10-02", body: "古い", writtenAt: "2026-10-02T01:00:00.000Z", thumb: "data:image/jpeg,keep" }),
      poem({ day: "2026-10-02", body: "届いた", thumb: "data:image/jpeg,day" }),
    ],
  });
  const file = empty({
    form: "haiku",
    lang: "ja",
    arrived: [
      poem({ id: "own", day: "2026-10-02", body: "新しい", writtenAt: "2026-10-02T02:00:00.000Z", thumb: "data:image/jpeg,no" }),
      poem({ id: "other", day: "2026-10-01", body: "足す", writtenAt: "2026-10-01T01:00:00.000Z" }),
      poem({ day: "2026-10-02", body: "別の届いた詩" }),
      poem({ day: "2026-10-01", body: "その日の届いた詩" }),
    ],
  });
  const merged = mergeCarry(device, file);
  const own = merged.arrived.find((item) => item.id === "own");
  assert.equal(own?.body, "新しい");
  assert.equal(own?.thumb, undefined);
  assert.equal(merged.arrived.find((item) => item.id === "other")?.body, "足す");
  assert.equal(merged.arrived.find((item) => !item.id && item.day === "2026-10-02")?.body, "届いた");
  assert.equal(merged.arrived.find((item) => !item.id && item.day === "2026-10-02")?.thumb, "data:image/jpeg,day");
  assert.equal(merged.arrived.find((item) => !item.id && item.day === "2026-10-01")?.body, "その日の届いた詩");
  assert.equal(merged.form, "haiku");
  assert.equal(merged.lang, "ja");
});

test("an older file does not replace a newer own poem", () => {
  const merged = mergeCarry(
    empty({ arrived: [poem({ id: "own", day: "2026-10-02", body: "端末", writtenAt: "2026-10-02T03:00:00.000Z" })] }),
    empty({ arrived: [poem({ id: "own", day: "2026-10-02", body: "ファイル", writtenAt: "2026-10-02T01:00:00.000Z" })] }),
  );
  assert.equal(merged.arrived[0]?.body, "端末");
});

test("reactions and reading keep the newer side and the poems already shown", () => {
  const merged = mergeCarry(
    empty({
      reactions: [
        { poemId: "a", sentiment: "like", reason: "端末", updatedAt: "2026-10-02T02:00:00.000Z" },
        { poemId: "b", sentiment: "dislike", reason: "", updatedAt: "2026-10-01T00:00:00.000Z" },
      ],
      reading: { free: { ...emptyRead(), shownIds: ["a"], lastPoemId: "a", day: "2026-10-01", countToday: 1 } },
    }),
    empty({
      reactions: [
        { poemId: "a", sentiment: "dislike", reason: "", updatedAt: "2026-10-02T01:00:00.000Z" },
        { poemId: "c", sentiment: "like", reason: "ファイル", updatedAt: "2026-10-02T00:00:00.000Z" },
      ],
      reading: { free: { ...emptyRead(), shownIds: ["c"], lastPoemId: "c", day: "2026-10-02", countToday: 2 } },
    }),
  );
  const a = merged.reactions.find((reaction) => reaction.poemId === "a");
  assert.equal(a?.sentiment, "like");
  assert.equal(merged.reactions.some((reaction) => reaction.poemId === "b"), true);
  assert.equal(merged.reactions.some((reaction) => reaction.poemId === "c"), true);
  assert.deepEqual(merged.reading.free?.shownIds.sort(), ["a", "c"]);
  assert.equal(merged.reading.free?.lastPoemId, "c");
  assert.equal(merged.reading.free?.day, "2026-10-02");
  assert.equal(merged.reading.free?.countToday, 2);
});

test("an unreadable file changes nothing", () => {
  assert.equal(parseCarry("not json"), null);
  assert.equal(parseCarry(JSON.stringify({ reactions: [], arrived: [{}], reading: {}, form: "free", lang: "mix" })), null);
});
