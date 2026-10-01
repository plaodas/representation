import assert from "node:assert/strict";
import test from "node:test";
import { acceptPoem } from "./poem.ts";

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
