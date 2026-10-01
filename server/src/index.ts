import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { openOrders } from "./db.ts";
import { dailyOrderLimit, deliveryOf, localParts, orderAllowed } from "./deliver.ts";
import { fulfill } from "./fulfill.ts";
import { orderInput } from "./intake.ts";
import { ensureModel } from "./ollama.ts";

const port = Number(process.env.PORT ?? "8787");
const limit = dailyOrderLimit(process.env.DAILY_ORDER_LIMIT);
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

const todayRow = (account: string, now: Date) =>
  orders.forAccount(account).find((row) => localParts(now, row.timeZone).date === row.localDate) ??
  null;

let ticking = false;
let modelReady = false;

const tick = async () => {
  if (ticking || !modelReady) return;
  ticking = true;
  try {
    for (const row of orders.due(new Date().toISOString())) {
      try {
        await fulfill(orders, row);
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
  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(request)) as unknown;
  } catch {
    return send(response, 400);
  }
  const input = orderInput(payload);
  if (!input) return send(response, 400);
  const now = new Date();
  const delivery = deliveryOf({
    now,
    timeZone: input.timeZone,
    localDate: input.localDate,
  });
  if (!delivery) return send(response, 400);
  const existing = orders.forAccount(account).find((row) => row.localDate === delivery.localDate);
  if (!orderAllowed(Boolean(existing), limit)) return send(response, 409);
  orders.place({
    account,
    localDate: delivery.localDate,
    timeZone: input.timeZone,
    deliverAt: delivery.deliverAt,
    pushToken: input.pushToken,
    fragments: JSON.stringify(input.fragments),
    say: JSON.stringify(input.say),
    lang: input.lang,
    sample: input.sample,
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
