import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import type { Form, Reaction, ReadState, Sentiment } from "../domain/types";
import { emptyRead } from "../domain/types";

const fileKey = "representation";

type FileState = {
  reactions: Reaction[];
  reading: Partial<Record<Form, ReadState>>;
  form: Form;
};

const emptyFile = (): FileState => ({ reactions: [], reading: {}, form: "free" });

const webWithoutFileSystem = () =>
  Platform.OS === "web" && (typeof navigator === "undefined" || !navigator.storage);

const readFile = (): FileState => {
  const raw = localStorage.getItem(fileKey);
  if (!raw) return emptyFile();
  return { ...emptyFile(), ...(JSON.parse(raw) as FileState) };
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
