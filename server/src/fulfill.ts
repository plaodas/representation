import type { Fragments } from "../../domain/fragments.ts";
import type { SayTag } from "../../domain/types.ts";
import type { OrderRow, Orders } from "./db.ts";
import { writePoem } from "./ollama.ts";
import { acceptPoem, tooClose } from "./poem.ts";
import { promptFor } from "./prompt.ts";

const pushBell = async (token: string | null) => {
  if (!token) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: token, body: "一首届きました" }),
    });
  } catch {
    // The row stays ready for the next opening.
  }
};

export const fulfill = async (orders: Orders, row: OrderRow) => {
  if (row.status === "作る" && row.attempts >= 2) {
    if (orders.fail(row)) console.log(`失敗 ${row.localDate}`);
    return;
  }
  let attempts = row.attempts;
  const fragments = JSON.parse(row.fragments ?? "null") as Fragments | null;
  const say = JSON.parse(row.say ?? "null") as Partial<Record<SayTag, number>> | null;
  if (!fragments || !say) {
    if (orders.fail(row)) console.log(`失敗 ${row.localDate}`);
    return;
  }
  while (attempts < 2) {
    attempts += 1;
    if (!orders.mark(row, "作る", attempts)) return;
    let text = "";
    try {
      text = await writePoem(promptFor({ fragments, say, lang: row.lang, sample: row.sample }));
    } catch (error) {
      orders.mark(row, "待つ", attempts - 1);
      throw error;
    }
    const poem = acceptPoem(text);
    if (poem && !tooClose(poem, row.sample)) {
      if (!orders.adopt(row, poem)) return;
      console.log(`届ける ${row.localDate} ${poem.split("\n").length}行`);
      await pushBell(row.pushToken);
      return;
    }
  }
  if (orders.fail(row)) console.log(`失敗 ${row.localDate}`);
};
