import assert from "node:assert/strict";
import test from "node:test";
import type { Fragments } from "../../domain/fragments.ts";
import { promptFor } from "./prompt.ts";
import { acceptPoem, tooClose } from "./poem.ts";

const poem = ["一", "二", "三", "四", "五", "六"].join("\n");

test("six to twelve lines are kept", () => {
  assert.equal(acceptPoem(poem), poem);
});

test("a list is refused", () => {
  assert.equal(acceptPoem(["- 空", "二", "三", "四", "五", "六"].join("\n")), null);
});

test("thinking and fences are peeled off", () => {
  const wrapped = `<think>下書き</think>\n\`\`\`\n${poem}\n\`\`\``;
  assert.equal(acceptPoem(wrapped), poem);
});

const sample = ["夕暮れが空を赤く染める", "誰もいないこの街角"].join("\n");
const distant = ["朝の机に湯気がある", "窓はまだ暗い", "パンの端をちぎる", "音だけが先に落ちる", "名前は置いておく", "白い縁が残る"].join("\n");

test("a copied sample line is refused", () => {
  const copied = ["朝の机に湯気がある", "夕暮れが空を赤く染める", "窓はまだ暗い", "パンの端をちぎる", "音だけが先に落ちる", "名前は置いておく"].join("\n");
  assert.equal(tooClose(copied, sample), true);
});

test("a distant poem is kept", () => {
  assert.equal(tooClose(distant, sample), false);
  assert.equal(tooClose(distant, null), false);
});

const fragments: Fragments = { see: ["sky"], person: false, season: "autumn" };

test("a prompt without a sample stays the same shape", () => {
  const prompt = promptFor({ fragments, say: { one_leap: 2 }, lang: "ja" });
  assert.equal(prompt.includes("この飛躍の仕方に寄せ"), false);
  assert.equal(prompt.includes("言い方の得点: 一段の飛躍 2"), true);
});

test("a prompt with a sample asks not to repeat it", () => {
  const prompt = promptFor({ fragments, say: {}, lang: "ja", sample });
  assert.equal(prompt.includes("この飛躍の仕方に寄せ、同じ言葉は繰り返さない。"), true);
  assert.equal(prompt.includes(sample), true);
});
