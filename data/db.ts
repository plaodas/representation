import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import type { Form, LangMode, Reaction, ReadState, SeeTag, Sentiment } from "../domain/types";
import { emptyRead, seeTags } from "../domain/types";

const fileKey = "representation";

export type Arrived = {
  day: string;
  lang: "ja" | "en";
  thumb: string;
  body: string;
  seen: boolean;
  see: SeeTag[];
  sentiment?: Sentiment;
  reason: string;
  scene: boolean;
  explains: boolean;
  missed: boolean;
  notedAt?: string;
  id?: string;
  writtenAt?: string;
};

type FileState = {
  reactions: Reaction[];
  reading: Partial<Record<Form, ReadState>>;
  form: Form;
  lang: LangMode;
  arrived: Arrived[];
  orderToken: string;
};

const emptyFile = (): FileState => ({
  reactions: [],
  reading: {},
  form: "free",
  lang: "mix",
  arrived: [],
  orderToken: "",
});

const webWithoutFileSystem = () =>
  Platform.OS === "web" && (typeof navigator === "undefined" || !navigator.storage);

const asLangMode = (value: string | undefined): LangMode =>
  value === "ja" || value === "en" ? value : "mix";

const asSee = (value: unknown): SeeTag[] =>
  Array.isArray(value)
    ? value.filter((tag): tag is SeeTag => typeof tag === "string" && seeTags.includes(tag as SeeTag))
    : [];

const isArrived = (value: unknown): value is Arrived => {
  if (!value || typeof value !== "object") return false;
  const poem = value as Arrived;
  return Boolean(poem.day) && (poem.lang === "ja" || poem.lang === "en");
};

const normalizeArrived = (poem: Arrived): Arrived => {
  const sentiment = poem.sentiment === "like" || poem.sentiment === "dislike" ? poem.sentiment : undefined;
  return {
    ...poem,
    see: asSee(poem.see),
    reason: typeof poem.reason === "string" ? poem.reason : "",
    scene: poem.scene === true,
    explains: poem.explains === true,
    missed: poem.missed === true,
    sentiment,
    notedAt: typeof poem.notedAt === "string" ? poem.notedAt : undefined,
    id: typeof poem.id === "string" && poem.id ? poem.id : undefined,
    writtenAt: typeof poem.writtenAt === "string" ? poem.writtenAt : undefined,
  };
};

const byMemory = (a: Arrived, b: Arrived) => {
  const day = b.day.localeCompare(a.day);
  if (day !== 0) return day;
  if (!a.writtenAt && b.writtenAt) return 1;
  if (a.writtenAt && !b.writtenAt) return -1;
  return (b.writtenAt ?? "").localeCompare(a.writtenAt ?? "");
};

const asList = (raw: unknown): Arrived[] => {
  const value = typeof raw === "string" && raw ? (JSON.parse(raw) as unknown) : raw;
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.filter(isArrived).map(normalizeArrived).sort(byMemory);
};

const readFile = (): FileState => {
  const raw = localStorage.getItem(fileKey);
  if (!raw) return emptyFile();
  const parsed = JSON.parse(raw) as Partial<FileState> & { arrived?: unknown };
  return {
    ...emptyFile(),
    ...parsed,
    lang: asLangMode(parsed.lang),
    arrived: asList(parsed.arrived),
  };
};

const writeFile = (file: FileState) => {
  localStorage.setItem(fileKey, JSON.stringify(file));
};

const database = () => SQLite.openDatabaseAsync("representation.db");

let ready: Promise<SQLite.SQLiteDatabase> | null = null;

const db = () => {
  ready ??= database().then(async (connection) => {
    await connection.execAsync(`
      CREATE TABLE IF NOT EXISTS reactions (
        poem_id TEXT PRIMARY KEY NOT NULL,
        sentiment TEXT NOT NULL,
        reason TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reading (
        form TEXT PRIMARY KEY NOT NULL,
        poem_id TEXT,
        day TEXT,
        count_today INTEGER NOT NULL,
        shown_ids TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    return connection;
  });
  return ready;
};

export const loadReactions = async (): Promise<Reaction[]> => {
  if (webWithoutFileSystem()) return readFile().reactions;
  const connection = await db();
  const rows = await connection.getAllAsync<{
    poem_id: string;
    sentiment: Sentiment;
    reason: string;
    updated_at: string;
  }>("SELECT poem_id, sentiment, reason, updated_at FROM reactions");
  return rows.map((row) => ({
    poemId: row.poem_id,
    sentiment: row.sentiment,
    reason: row.reason,
    updatedAt: row.updated_at,
  }));
};

export const saveReaction = async (
  poemId: string,
  sentiment: Sentiment,
  reason: string,
) => {
  if (webWithoutFileSystem()) {
    const file = readFile();
    const existing = file.reactions.find((item) => item.poemId === poemId);
    const kept = sentiment === "like" ? reason : (existing?.reason ?? reason);
    const next: Reaction = {
      poemId,
      sentiment,
      reason: kept,
      updatedAt: new Date().toISOString(),
    };
    file.reactions = [
      next,
      ...file.reactions.filter((item) => item.poemId !== poemId),
    ];
    writeFile(file);
    return;
  }
  const connection = await db();
  const existing = await connection.getFirstAsync<{ reason: string }>(
    "SELECT reason FROM reactions WHERE poem_id = ?",
    poemId,
  );
  const kept = sentiment === "like" ? reason : (existing?.reason ?? reason);
  await connection.runAsync(
    `INSERT INTO reactions (poem_id, sentiment, reason, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(poem_id) DO UPDATE SET
       sentiment = excluded.sentiment,
       reason = excluded.reason,
       updated_at = excluded.updated_at`,
    poemId,
    sentiment,
    kept,
    new Date().toISOString(),
  );
};

export const loadRead = async (form: Form): Promise<ReadState> => {
  if (webWithoutFileSystem()) return readFile().reading[form] ?? emptyRead();
  const connection = await db();
  const row = await connection.getFirstAsync<{
    poem_id: string | null;
    day: string | null;
    count_today: number;
    shown_ids: string;
  }>("SELECT poem_id, day, count_today, shown_ids FROM reading WHERE form = ?", form);
  if (!row) return emptyRead();
  return {
    lastPoemId: row.poem_id,
    day: row.day,
    countToday: row.count_today,
    shownIds: JSON.parse(row.shown_ids) as string[],
  };
};

export const saveRead = async (form: Form, read: ReadState) => {
  if (webWithoutFileSystem()) {
    const file = readFile();
    file.reading[form] = read;
    writeFile(file);
    return;
  }
  const connection = await db();
  await connection.runAsync(
    `INSERT INTO reading (form, poem_id, day, count_today, shown_ids)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(form) DO UPDATE SET
       poem_id = excluded.poem_id,
       day = excluded.day,
       count_today = excluded.count_today,
       shown_ids = excluded.shown_ids`,
    form,
    read.lastPoemId,
    read.day,
    read.countToday,
    JSON.stringify(read.shownIds),
  );
};

export const loadForm = async (): Promise<Form> => {
  if (webWithoutFileSystem()) return readFile().form;
  const connection = await db();
  const row = await connection.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'form'",
  );
  if (row?.value === "haiku" || row?.value === "tanka" || row?.value === "fixed") {
    return row.value;
  }
  return "free";
};

export const loadLang = async (): Promise<LangMode> => {
  if (webWithoutFileSystem()) return readFile().lang;
  const connection = await db();
  const row = await connection.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'lang'",
  );
  return asLangMode(row?.value);
};

export const saveLang = async (lang: LangMode) => {
  if (webWithoutFileSystem()) {
    const file = readFile();
    file.lang = lang;
    writeFile(file);
    return;
  }
  const connection = await db();
  await connection.runAsync(
    `INSERT INTO meta (key, value) VALUES ('lang', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    lang,
  );
};

export const saveForm = async (form: Form) => {
  if (webWithoutFileSystem()) {
    const file = readFile();
    file.form = form;
    writeFile(file);
    return;
  }
  const connection = await db();
  await connection.runAsync(
    `INSERT INTO meta (key, value) VALUES ('form', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    form,
  );
};

const meta = async (key: string) => {
  const connection = await db();
  const row = await connection.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    key,
  );
  return row?.value ?? "";
};

const saveMeta = async (key: string, value: string) => {
  const connection = await db();
  await connection.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
};

const writeArrived = async (arrived: Arrived[]) => {
  const next = [...arrived].sort(byMemory);
  if (webWithoutFileSystem()) {
    const file = readFile();
    file.arrived = next;
    writeFile(file);
    return;
  }
  await saveMeta("arrived", JSON.stringify(next));
};

export const loadArrived = async (): Promise<Arrived[]> => {
  if (webWithoutFileSystem()) return readFile().arrived;
  return asList(await meta("arrived"));
};

export const deliveredArrived = (rows: Arrived[], day: string) =>
  rows.find((item) => item.day === day && !item.id);

export const saveArrived = async (arrived: Arrived) => {
  const stored = await loadArrived();
  const same = (item: Arrived) =>
    arrived.id ? item.id === arrived.id : !item.id && item.day === arrived.day;
  await writeArrived([arrived, ...stored.filter((item) => !same(item))]);
};

export const removeArrived = async (id: string) => {
  if (!id) return;
  const stored = await loadArrived();
  await writeArrived(stored.filter((item) => item.id !== id));
};

export const orderToken = async () => {
  const existing = webWithoutFileSystem() ? readFile().orderToken : await meta("order-token");
  if (existing.length >= 16) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes));
  if (webWithoutFileSystem()) {
    const file = readFile();
    file.orderToken = token;
    writeFile(file);
    return token;
  }
  await saveMeta("order-token", token);
  return token;
};
