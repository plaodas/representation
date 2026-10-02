import { emptyRead, forms, langModes, seeTags, type Form, type LangMode, type Reaction, type ReadState, type SeeTag, type Sentiment } from "./types.ts";

export type CarryPoem = {
  day: string;
  lang: "ja" | "en";
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
  thumb?: string;
};

export type Carry = {
  reactions: Reaction[];
  reading: Partial<Record<Form, ReadState>>;
  form: Form;
  lang: LangMode;
  arrived: CarryPoem[];
};

const dayKey = /^\d{4}-\d{2}-\d{2}$/;

const asSee = (value: unknown): SeeTag[] | null => {
  if (!Array.isArray(value)) return null;
  const tags: SeeTag[] = [];
  for (const tag of value) {
    if (typeof tag !== "string" || !seeTags.includes(tag as SeeTag)) return null;
    tags.push(tag as SeeTag);
  }
  return tags;
};

const parseReaction = (value: unknown): Reaction | null => {
  if (!value || typeof value !== "object") return null;
  const reaction = value as Reaction;
  if (typeof reaction.poemId !== "string" || !reaction.poemId) return null;
  if (reaction.sentiment !== "like" && reaction.sentiment !== "dislike") return null;
  if (typeof reaction.reason !== "string" || typeof reaction.updatedAt !== "string") return null;
  return {
    poemId: reaction.poemId,
    sentiment: reaction.sentiment,
    reason: reaction.reason,
    updatedAt: reaction.updatedAt,
  };
};

const parsePoem = (value: unknown): CarryPoem | null => {
  if (!value || typeof value !== "object") return null;
  const poem = value as CarryPoem;
  if (typeof poem.day !== "string" || !dayKey.test(poem.day)) return null;
  if (poem.lang !== "ja" && poem.lang !== "en") return null;
  if (typeof poem.body !== "string") return null;
  const see = asSee(poem.see ?? []);
  if (!see) return null;
  if (poem.sentiment !== undefined && poem.sentiment !== "like" && poem.sentiment !== "dislike") return null;
  return {
    day: poem.day,
    lang: poem.lang,
    body: poem.body,
    seen: poem.seen === true,
    see,
    sentiment: poem.sentiment,
    reason: typeof poem.reason === "string" ? poem.reason : "",
    scene: poem.scene === true,
    explains: poem.explains === true,
    missed: poem.missed === true,
    notedAt: typeof poem.notedAt === "string" ? poem.notedAt : undefined,
    id: typeof poem.id === "string" && poem.id ? poem.id : undefined,
    writtenAt: typeof poem.writtenAt === "string" ? poem.writtenAt : undefined,
  };
};

const parseRead = (value: unknown): ReadState | null => {
  if (!value || typeof value !== "object") return null;
  const read = value as ReadState;
  if (!Array.isArray(read.shownIds) || read.shownIds.some((id) => typeof id !== "string")) return null;
  if (read.lastPoemId !== null && typeof read.lastPoemId !== "string") return null;
  if (read.day !== null && (typeof read.day !== "string" || !dayKey.test(read.day))) return null;
  if (typeof read.countToday !== "number" || !Number.isFinite(read.countToday)) return null;
  return {
    shownIds: read.shownIds,
    lastPoemId: read.lastPoemId,
    day: read.day,
    countToday: read.countToday,
  };
};

const parseReading = (value: object): Partial<Record<Form, ReadState>> | null => {
  const reading: Partial<Record<Form, ReadState>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!forms.includes(key as Form)) continue;
    const read = parseRead(item);
    if (!read) return null;
    reading[key as Form] = read;
  }
  return reading;
};

export const parseCarry = (text: string): Carry | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.reactions) || !Array.isArray(value.arrived)) return null;
  if (!value.reading || typeof value.reading !== "object" || Array.isArray(value.reading)) return null;
  if (!forms.includes(value.form as Form) || !langModes.includes(value.lang as LangMode)) return null;
  const reactions = value.reactions.map(parseReaction);
  if (reactions.some((item) => !item)) return null;
  const arrived = value.arrived.map(parsePoem);
  if (arrived.some((item) => !item)) return null;
  const reading = parseReading(value.reading);
  if (!reading) return null;
  return {
    reactions: reactions as Reaction[],
    reading,
    form: value.form as Form,
    lang: value.lang as LangMode,
    arrived: arrived as CarryPoem[],
  };
};

export const carryText = (carry: Carry): string =>
  JSON.stringify({
    reactions: carry.reactions,
    reading: carry.reading,
    form: carry.form,
    lang: carry.lang,
    arrived: carry.arrived.map(({ thumb: _thumb, ...poem }) => poem),
  });

const fileWins = (fileAt: string | undefined, deviceAt: string | undefined) =>
  Boolean(fileAt) && (!deviceAt || fileAt! > deviceAt);

const withoutThumb = ({ thumb: _thumb, ...poem }: CarryPoem): CarryPoem => poem;

const mergePoems = (device: CarryPoem[], file: CarryPoem[]): CarryPoem[] => {
  const own = new Map<string, CarryPoem>();
  for (const poem of device) {
    if (poem.id) own.set(poem.id, poem);
  }
  for (const poem of file) {
    if (!poem.id) continue;
    const current = own.get(poem.id);
    if (!current || fileWins(poem.writtenAt, current.writtenAt)) own.set(poem.id, withoutThumb(poem));
  }
  const delivered = new Map<string, CarryPoem>();
  for (const poem of device) {
    if (!poem.id) delivered.set(poem.day, poem);
  }
  for (const poem of file) {
    if (poem.id || delivered.has(poem.day)) continue;
    delivered.set(poem.day, withoutThumb(poem));
  }
  return [...own.values(), ...delivered.values()];
};

const mergeReactions = (device: Reaction[], file: Reaction[]): Reaction[] => {
  const reactions = new Map(device.map((reaction) => [reaction.poemId, reaction]));
  for (const reaction of file) {
    const current = reactions.get(reaction.poemId);
    if (!current || fileWins(reaction.updatedAt, current.updatedAt)) reactions.set(reaction.poemId, reaction);
  }
  return [...reactions.values()];
};

const mergeRead = (device: ReadState | undefined, file: ReadState | undefined): ReadState => {
  const base = device ?? emptyRead();
  const incoming = file ?? emptyRead();
  const shownIds = [...new Set([...base.shownIds, ...incoming.shownIds])];
  const cursor = fileWins(incoming.day ?? undefined, base.day ?? undefined) ? incoming : base;
  return {
    shownIds,
    lastPoemId: cursor.lastPoemId,
    day: cursor.day,
    countToday: cursor.countToday,
  };
};

export const mergeCarry = (device: Carry, file: Carry): Carry => {
  const reading: Partial<Record<Form, ReadState>> = {};
  for (const form of forms) {
    if (!device.reading[form] && !file.reading[form]) continue;
    reading[form] = mergeRead(device.reading[form], file.reading[form]);
  }
  return {
    reactions: mergeReactions(device.reactions, file.reactions),
    reading,
    form: file.form,
    lang: file.lang,
    arrived: mergePoems(device.arrived, file.arrived),
  };
};
