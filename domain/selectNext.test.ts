import assert from "node:assert/strict";
import test from "node:test";
import { advanceRead, formForLang, freeSay, nextForm, resolveOpen, selectNextPoem } from "./selectNext.ts";
import { emptyRead, type Poem, type Reaction } from "./types.ts";

const poem = (partial: Pick<Poem, "id" | "form" | "lang" | "poet" | "order"> & Partial<Poem>): Poem => ({
  body: partial.id,
  title: "",
  source: "",
  sourceYear: 1900,
  origin: "https://example.test",
  deathYear: 1900,
  see: [],
  say: [],
  ...partial,
});

const like = (poemId: string): Reaction => ({
  poemId,
  sentiment: "like",
  reason: "",
  updatedAt: "2026-09-26T00:00:00.000Z",
});

test("free verse starts in Japanese and then alternates", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
    poem({ id: "ja2", form: "free", lang: "ja", poet: "乙", order: 3 }),
  ];
  let read = emptyRead();
  const first = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read });
  assert.equal(first, "ja1");
  read = advanceRead(read, first, "2026-09-26");
  const second = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read });
  assert.equal(second, "en1");
  read = advanceRead(read, second, "2026-09-26");
  const third = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read });
  assert.equal(third, "ja2");
});

test("haiku stays in Japanese", () => {
  const poems = [
    poem({ id: "en", form: "haiku", lang: "en", poet: "A", order: 1 }),
    poem({ id: "ja", form: "haiku", lang: "ja", poet: "甲", order: 2 }),
  ];
  const id = selectNextPoem({
    poems,
    reactions: [],
    today: "2026-09-26",
    form: "haiku",
    read: emptyRead(),
  });
  assert.equal(id, "ja");
});

test("does not mix forms", () => {
  const poems = [
    poem({ id: "h", form: "haiku", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "f", form: "free", lang: "ja", poet: "乙", order: 2 }),
  ];
  const id = selectNextPoem({
    poems,
    reactions: [],
    today: "2026-09-26",
    form: "free",
    read: emptyRead(),
  });
  assert.equal(id, "f");
});

test("same poet does not follow when another exists", () => {
  const poems = [
    poem({ id: "a1", form: "haiku", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "a2", form: "haiku", lang: "ja", poet: "甲", order: 2 }),
    poem({ id: "b", form: "haiku", lang: "ja", poet: "乙", order: 3 }),
  ];
  const read = advanceRead(emptyRead(), "a1", "2026-09-26");
  const id = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "haiku", read });
  assert.equal(id, "b");
});

test("an exhausted language returns from the oldest", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
    poem({ id: "ja2", form: "free", lang: "ja", poet: "乙", order: 3 }),
  ];
  let read = emptyRead();
  for (const id of ["ja1", "en1", "ja2"]) read = advanceRead(read, id, "2026-09-26");
  const next = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read });
  assert.equal(next, "en1");
});

test("eight likes in the form begin preference, and seeing crosses forms", () => {
  const fillers = Array.from({ length: 8 }, (_, index) =>
    poem({ id: `pad${index}`, form: "free", lang: "ja", poet: `補${index}`, order: 100 + index, see: ["food"] }),
  );
  const poems = [
    ...fillers,
    poem({ id: "dry", form: "free", lang: "en", poet: "A", order: 1, see: ["street"] }),
    poem({ id: "wet", form: "free", lang: "en", poet: "B", order: 2, see: ["water"] }),
    poem({ id: "hai", form: "haiku", lang: "ja", poet: "句", order: 3, see: ["water"], say: ["short_line"] }),
  ];
  const reactions = fillers.map((item) => like(item.id)).concat(like("hai"));
  const read = advanceRead(emptyRead(), "pad0", "2026-09-26");
  const id = selectNextPoem({ poems, reactions, today: "2026-09-26", form: "free", read });
  assert.equal(id, "wet");
});

test("saying stays inside the form", () => {
  const fillers = Array.from({ length: 8 }, (_, index) =>
    poem({ id: `pad${index}`, form: "free", lang: "ja", poet: `補${index}`, order: 50 + index }),
  );
  const poems = [
    ...fillers,
    poem({ id: "early", form: "free", lang: "en", poet: "A", order: 1, say: ["short_line"] }),
    poem({ id: "late", form: "free", lang: "en", poet: "B", order: 2, say: ["explains"] }),
    poem({ id: "hai", form: "haiku", lang: "ja", poet: "句", order: 3, say: ["explains"] }),
  ];
  const reactions = [...fillers.map((item) => like(item.id)), like("hai")];
  const read = advanceRead(emptyRead(), "pad0", "2026-09-26");
  const id = selectNextPoem({ poems, reactions, today: "2026-09-26", form: "free", read });
  assert.equal(id, "early");
});

test("every fourth personalized poem steps slightly off the top", () => {
  const fillers = Array.from({ length: 8 }, (_, index) =>
    poem({ id: `pad${index}`, form: "haiku", lang: "ja", poet: `補${index}`, order: 10 + index, see: ["water"] }),
  );
  const seen = Array.from({ length: 3 }, (_, index) =>
    poem({ id: `seen${index}`, form: "haiku", lang: "ja", poet: `既${index}`, order: 30 + index, see: ["food"] }),
  );
  const poems = [
    poem({ id: "best", form: "haiku", lang: "ja", poet: "甲", order: 1, see: ["water"] }),
    poem({ id: "near", form: "haiku", lang: "ja", poet: "乙", order: 2, see: ["sky"] }),
    poem({ id: "far", form: "haiku", lang: "ja", poet: "丙", order: 3, see: ["street"] }),
    ...fillers,
    ...seen,
  ];
  const reactions = fillers.map((item) => like(item.id));
  const read = {
    ...emptyRead(),
    shownIds: [...fillers.map((item) => item.id), ...seen.map((item) => item.id)],
  };
  const id = selectNextPoem({ poems, reactions, today: "2026-09-26", form: "haiku", read });
  assert.equal(id, "near");
});

test("the same day keeps the poem, the next day continues", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
  ];
  const opened = resolveOpen({
    poems,
    reactions: [],
    today: "2026-09-26",
    form: "free",
    read: emptyRead(),
  });
  const again = resolveOpen({
    poems,
    reactions: [],
    today: "2026-09-26",
    form: "free",
    read: opened.read,
  });
  assert.equal(again.poemId, opened.poemId);
  const tomorrow = resolveOpen({
    poems,
    reactions: [],
    today: "2026-09-27",
    form: "free",
    read: opened.read,
  });
  assert.equal(tomorrow.poemId, "en1");
  assert.equal(tomorrow.read.countToday, 1);
});

test("japanese only stays in Japanese", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
    poem({ id: "ja2", form: "free", lang: "ja", poet: "乙", order: 3 }),
  ];
  let read = advanceRead(emptyRead(), "ja1", "2026-09-26");
  const next = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read, langMode: "ja" });
  assert.equal(next, "ja2");
  read = advanceRead(read, next, "2026-09-26");
  const again = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read, langMode: "ja" });
  assert.equal(again, "ja1");
});

test("english only stays in English", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
    poem({ id: "en2", form: "free", lang: "en", poet: "B", order: 3 }),
  ];
  const read = advanceRead(emptyRead(), "en1", "2026-09-26");
  const next = selectNextPoem({ poems, reactions: [], today: "2026-09-26", form: "free", read, langMode: "en" });
  assert.equal(next, "en2");
});

test("likes in the other language still count toward eight", () => {
  const liked = Array.from({ length: 8 }, (_, index) =>
    poem({ id: `en${index}`, form: "free", lang: "en", poet: `E${index}`, order: 10 + index, see: ["water"] }),
  );
  const poems = [
    poem({ id: "street", form: "free", lang: "ja", poet: "甲", order: 1, see: ["street"] }),
    poem({ id: "water", form: "free", lang: "ja", poet: "乙", order: 2, see: ["water"] }),
    ...liked,
  ];
  const read = advanceRead(emptyRead(), "en0", "2026-09-26");
  const id = selectNextPoem({
    poems,
    reactions: liked.map((item) => like(item.id)),
    today: "2026-09-26",
    form: "free",
    read,
    langMode: "ja",
  });
  assert.equal(id, "water");
});

test("the same day does not keep a poem outside the chosen language", () => {
  const poems = [
    poem({ id: "ja1", form: "free", lang: "ja", poet: "甲", order: 1 }),
    poem({ id: "en1", form: "free", lang: "en", poet: "A", order: 2 }),
  ];
  const read = advanceRead(emptyRead(), "en1", "2026-09-26");
  const opened = resolveOpen({
    poems,
    reactions: [],
    today: "2026-09-26",
    form: "free",
    read,
    langMode: "ja",
  });
  assert.equal(opened.poemId, "ja1");
});

test("photo orders send only the free-verse way of saying", () => {
  const poems = [
    poem({ id: "free1", form: "free", lang: "ja", poet: "甲", order: 1, say: ["short_line", "stops"] }),
    poem({ id: "fixed1", form: "fixed", lang: "ja", poet: "乙", order: 1, say: ["rhyme"] }),
  ];
  const scores = freeSay(poems, [like("free1"), like("fixed1")]);
  assert.equal(scores.short_line, 1);
  assert.equal(scores.stops, 1);
  assert.equal(scores.rhyme, undefined);
});

test("english only skips haiku and tanka", () => {
  assert.equal(nextForm("free", "en"), "fixed");
  assert.equal(nextForm("fixed", "en"), "free");
  assert.equal(nextForm("haiku", "mix"), "tanka");
  assert.equal(formForLang("haiku", "en"), "fixed");
  assert.equal(formForLang("tanka", "en"), "fixed");
  assert.equal(formForLang("free", "en"), "free");
});
