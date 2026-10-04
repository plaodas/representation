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

test("shared words with the sample are kept", () => {
  const near = ["夕暮れの縁", "空の赤", "街角の石", "誰もいない部屋", "机の上", "湯気が立つ"].join("\n");
  assert.equal(tooClose(near, sample), false);
});

const fragments: Fragments = { see: ["sky"], person: false, season: "autumn" };

test("a prompt without a sample keeps the seen names out of the poem", () => {
  const prompt = promptFor({ fragments, say: { one_leap: 2 }, lang: "ja" });
  assert.equal(prompt.includes("見ることの名は詩に書かない。そこから一段離れた言葉を使う。"), true);
  assert.equal(prompt.includes("見本の言葉へ寄せ"), false);
  assert.equal(prompt.includes("言い方の得点: 一段の飛躍 2"), true);
});

test("a prompt with a sample leans toward its words", () => {
  const prompt = promptFor({ fragments, say: {}, lang: "ja", sample });
  assert.equal(prompt.includes("見本の言葉へ寄せ、見ることの名からは離れる。見本の行はそのまま書かない。"), true);
  assert.equal(prompt.includes(sample), true);
});

test("an English prompt says the same", () => {
  const plain = promptFor({ fragments, say: {}, lang: "en" });
  assert.equal(
    plain.includes("Do not use the names under Seen as words in the poem. Use words one step away from them."),
    true,
  );
  assert.equal(plain.includes("Lean toward the sample's words"), false);
  const withSample = promptFor({ fragments, say: {}, lang: "en", sample });
  assert.equal(
    withSample.includes(
      "Lean toward the sample's words, and away from the names under Seen. Do not copy a line of the sample.",
    ),
    true,
  );
});
