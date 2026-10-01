import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { seasons, type Fragments, type Season } from "../../domain/fragments.ts";
import { sayTags, seeTags, type SayTag, type SeeTag } from "../../domain/types.ts";
import { openOrders, type OrderRow } from "./db.ts";
import { canReplace, deliveryOf, localParts } from "./deliver.ts";
import { ensureModel, writePoem } from "./ollama.ts";
import { acceptPoem, tooClose } from "./poem.ts";
import { promptFor } from "./prompt.ts";

const port = Number(process.env.PORT ?? "8787");
const immediate = process.env.DELIVER_IMMEDIATE === "1";
const loopMs = Number(process.env.LOOP_MS ?? "300000");
const orders = openOrders(process.env.DATA_PATH ?? "/data/orders.db");

const accountFrom = (header: string | undefined) => {
  if (process.env.AUTH_MODE !== "local") return null;
  const match = /^Bearer\s+(\S+)$/.exec(header ?? "");
  if (!match || match[1].length < 16) return null;
  const subject = createHash("sha256").update(match[1]).digest("hex").slice(0, 32);
  return `local:${subject}`;
};

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32_768) {
        reject(new Error("large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const send = (response: ServerResponse, status: number, body?: unknown) => {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body === undefined ? "" : JSON.stringify(body));
};

const isSee = (value: string): value is SeeTag => seeTags.includes(value as SeeTag);
const isSay = (value: string): value is SayTag => sayTags.includes(value as SayTag);
const isSeason = (value: string): value is Season => seasons.includes(value as Season);

const fragmentsOf = (value: unknown): Fragments | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as { see?: unknown; person?: unknown; season?: unknown };
  if (!Array.isArray(raw.see) || !raw.see.every((tag) => typeof tag === "string" && isSee(tag))) {
    return null;
  }
  if (typeof raw.person !== "boolean" || typeof raw.season !== "string" || !isSeason(raw.season)) {
    return null;
  }
  return { see: raw.see, person: raw.person, season: raw.season };
};

const sayOf = (value: unknown): Partial<Record<SayTag, number>> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const say: Partial<Record<SayTag, number>> = {};
  for (const [key, score] of Object.entries(value)) {
    if (!isSay(key) || typeof score !== "number" || !Number.isFinite(score)) return null;
    say[key] = score;
  }
  return say;
};

const zoneOk = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const todayRow = (account: string, now: Date) =>
  orders.forAccount(account).find((row) => localParts(now, row.timeZone).date === row.localDate) ??
  null;

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

const fulfill = async (row: OrderRow) => {
  if (row.status === "作る" && row.attempts >= 2) {
    orders.fail(row);
    console.log(`失敗 ${row.localDate}`);
    return;
  }
  let attempts = row.attempts;
  const fragments = JSON.parse(row.fragments ?? "null") as Fragments | null;
  const say = JSON.parse(row.say ?? "null") as Partial<Record<SayTag, number>> | null;
  if (!fragments || !say) {
    orders.fail(row);
    return;
  }
  while (attempts < 2) {
    attempts += 1;
    orders.mark(row, "作る", attempts);
    let text = "";
    try {
      text = await writePoem(promptFor({ fragments, say, lang: row.lang, sample: row.sample }));
    } catch (error) {
      orders.mark(row, "待つ", attempts - 1);
      throw error;
    }
    const poem = acceptPoem(text);
    if (poem && !tooClose(poem, row.sample)) {
      orders.adopt(row, poem);
      console.log(`届ける ${row.localDate} ${poem.split("\n").length}行`);
      await pushBell(row.pushToken);
      return;
    }
  }
  orders.fail(row);
  console.log(`失敗 ${row.localDate}`);
};

let ticking = false;
let modelReady = false;

const tick = async () => {
  if (ticking || !modelReady) return;
  ticking = true;
  try {
    for (const row of orders.due(new Date().toISOString())) {
      try {
        await fulfill(row);
      } catch (error) {
        console.log(`待つ ${row.localDate} ${error instanceof Error ? error.message : "error"}`);
      }
    }
  } finally {
    ticking = false;
  }
};

const place = async (request: IncomingMessage, response: ServerResponse) => {
  const account = accountFrom(request.headers.authorization);
  if (!account) return send(response, 401);
  let payload: {
    localDate?: unknown;
    timeZone?: unknown;
    pushToken?: unknown;
    fragments?: unknown;
    say?: unknown;
    lang?: unknown;
    sample?: unknown;
  };
  try {
    payload = JSON.parse(await readBody(request)) as typeof payload;
  } catch {
    return send(response, 400);
  }
  if (typeof payload.localDate !== "string" || typeof payload.timeZone !== "string" || !zoneOk(payload.timeZone)) {
    return send(response, 400);
  }
  if (payload.lang !== "ja" && payload.lang !== "en") return send(response, 400);
  const fragments = fragmentsOf(payload.fragments);
  const say = sayOf(payload.say);
  if (!fragments || !say) return send(response, 400);
  const pushToken = typeof payload.pushToken === "string" ? payload.pushToken : null;
  const now = new Date();
  const delivery = deliveryOf({
    now,
    timeZone: payload.timeZone,
    localDate: payload.localDate,
    immediate,
  });
  if (!delivery) return send(response, 400);
  const existing = orders.forAccount(account).find((row) => row.localDate === delivery.localDate);
  const hour = localParts(now, payload.timeZone).hour;
  if (existing && !canReplace(existing.status, hour, immediate)) return send(response, 409);
  orders.place({
    account,
    localDate: delivery.localDate,
    timeZone: payload.timeZone,
    deliverAt: delivery.deliverAt,
    pushToken,
    fragments: JSON.stringify(fragments),
    say: JSON.stringify(say),
    lang: payload.lang,
    sample: typeof payload.sample === "string" && payload.sample.trim() ? payload.sample.trim() : null,
  });
  console.log(`待つ ${delivery.localDate}`);
  send(response, 204);
  void tick();
};

const today = (request: IncomingMessage, response: ServerResponse) => {
  const account = accountFrom(request.headers.authorization);
  if (!account) return send(response, 401);
  const row = todayRow(account, new Date());
  if (!row) return send(response, 204);
  if (row.status === "届ける" && row.body) {
    const body = row.body;
    const lang = row.lang;
    orders.hand(row);
    return send(response, 200, { status: "届ける", body, lang });
  }
  send(response, 200, { status: row.status });
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "OPTIONS") return send(response, 204);
  if (request.method === "POST" && url.pathname === "/orders") {
    void place(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/orders/today") return today(request, response);
  send(response, 404);
});

server.listen(port, () => {
  console.log(`注文 ${port}`);
  setInterval(() => void tick(), loopMs);
  const wake = () =>
    ensureModel()
      .then(() => {
        modelReady = true;
        console.log(`模型 ${process.env.OLLAMA_MODEL || "qwen3.5:9b"}`);
        return tick();
      })
      .catch((error: unknown) => {
        console.log(error instanceof Error ? error.message : "model");
        setTimeout(wake, 3000);
      });
  wake();
});
