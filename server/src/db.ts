import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Status = "待つ" | "作る" | "届ける" | "渡した" | "失敗";

export type OrderRow = {
  account: string;
  localDate: string;
  timeZone: string;
  deliverAt: string;
  pushToken: string | null;
  fragments: string | null;
  say: string | null;
  lang: "ja" | "en";
  status: Status;
  attempts: number;
  body: string | null;
};

type Stored = {
  account: string;
  local_date: string;
  time_zone: string;
  deliver_at: string;
  push_token: string | null;
  fragments: string | null;
  say: string | null;
  lang: "ja" | "en";
  status: Status;
  attempts: number;
  body: string | null;
};

const rowOf = (stored: Stored): OrderRow => ({
  account: stored.account,
  localDate: stored.local_date,
  timeZone: stored.time_zone,
  deliverAt: stored.deliver_at,
  pushToken: stored.push_token,
  fragments: stored.fragments,
  say: stored.say,
  lang: stored.lang,
  status: stored.status,
  attempts: stored.attempts,
  body: stored.body,
});

export const openOrders = (path: string) => {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      account TEXT NOT NULL,
      local_date TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      deliver_at TEXT NOT NULL,
      push_token TEXT,
      fragments TEXT,
      say TEXT,
      lang TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      body TEXT,
      PRIMARY KEY (account, local_date)
    );
  `);

  const write = db.prepare(`
    INSERT INTO orders (
      account, local_date, time_zone, deliver_at, push_token, fragments, say, lang, status, attempts, body
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '待つ', 0, NULL)
    ON CONFLICT(account, local_date) DO UPDATE SET
      time_zone = excluded.time_zone,
      deliver_at = excluded.deliver_at,
      push_token = excluded.push_token,
      fragments = excluded.fragments,
      say = excluded.say,
      lang = excluded.lang,
      status = '待つ',
      attempts = 0,
      body = NULL
  `);
  const byAccount = db.prepare(
    "SELECT * FROM orders WHERE account = ? ORDER BY local_date",
  );
  const due = db.prepare(
    `SELECT * FROM orders
     WHERE deliver_at <= ?
       AND (status = '待つ' OR status = '作る')
     ORDER BY deliver_at`,
  );
  const mark = db.prepare(
    `UPDATE orders SET status = ?, attempts = ? WHERE account = ? AND local_date = ?`,
  );
  const adopt = db.prepare(
    `UPDATE orders
     SET status = '届ける', body = ?, fragments = NULL
     WHERE account = ? AND local_date = ?`,
  );
  const fail = db.prepare(
    `UPDATE orders SET status = '失敗', fragments = NULL WHERE account = ? AND local_date = ?`,
  );
  const hand = db.prepare(
    `UPDATE orders SET status = '渡した', body = NULL, fragments = NULL
     WHERE account = ? AND local_date = ?`,
  );

  return {
    place(row: Omit<OrderRow, "status" | "attempts" | "body">) {
      write.run(
        row.account,
        row.localDate,
        row.timeZone,
        row.deliverAt,
        row.pushToken,
        row.fragments,
        row.say,
        row.lang,
      );
    },
    forAccount(account: string) {
      return (byAccount.all(account) as Stored[]).map(rowOf);
    },
    due(nowIso: string) {
      return (due.all(nowIso) as Stored[]).map(rowOf);
    },
    mark(row: OrderRow, status: Status, attempts: number) {
      mark.run(status, attempts, row.account, row.localDate);
    },
    adopt(row: OrderRow, body: string) {
      adopt.run(body, row.account, row.localDate);
    },
    fail(row: OrderRow) {
      fail.run(row.account, row.localDate);
    },
    hand(row: OrderRow) {
      hand.run(row.account, row.localDate);
    },
  };
};

export type Orders = ReturnType<typeof openOrders>;
