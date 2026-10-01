import { seasons, type Fragments, type Season } from "../../domain/fragments.ts";
import { sayTags, seeTags, type SayTag, type SeeTag } from "../../domain/types.ts";

export type OrderInput = {
  localDate: string;
  timeZone: string;
  pushToken: string | null;
  fragments: Fragments;
  say: Partial<Record<SayTag, number>>;
  lang: "ja" | "en";
  sample: string | null;
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

export const orderInput = (payload: unknown): OrderInput | null => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as {
    localDate?: unknown;
    timeZone?: unknown;
    pushToken?: unknown;
    fragments?: unknown;
    say?: unknown;
    lang?: unknown;
    sample?: unknown;
  };
  if (typeof raw.localDate !== "string" || typeof raw.timeZone !== "string" || !zoneOk(raw.timeZone)) {
    return null;
  }
  if (raw.lang !== "ja" && raw.lang !== "en") return null;
  const fragments = fragmentsOf(raw.fragments);
  const say = sayOf(raw.say);
  if (!fragments || !say) return null;
  return {
    localDate: raw.localDate,
    timeZone: raw.timeZone,
    pushToken: typeof raw.pushToken === "string" ? raw.pushToken : null,
    fragments,
    say,
    lang: raw.lang,
    sample: typeof raw.sample === "string" && raw.sample.trim() ? raw.sample.trim() : null,
  };
};
