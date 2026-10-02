import { arrivedNotes, freeSay } from "../domain/selectNext";
import type { LangMode, Reaction } from "../domain/types";
import { loadArrived, orderToken, saveArrived, type Arrived } from "./db";
import { allPoems, todayKey } from "./library";
import { reducePhoto } from "./reducePhoto";

const base = () => {
  const fromEnv = process.env.EXPO_PUBLIC_ORDER_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof location !== "undefined" && location.hostname) {
    return `http://${location.hostname}:8787`;
  }
  return "";
};

type Today =
  | { status: "届ける"; body: string; lang: "ja" | "en" }
  | { status: "待つ" | "作る" | "渡した" | "失敗" }
  | null;

const authed = async (path: string, init?: RequestInit): Promise<Response | null> => {
  const root = base();
  if (!root) return null;
  const token = await orderToken();
  return fetch(`${root}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
};

export const takeToday = async (): Promise<Today> => {
  const response = await authed("/orders/today");
  if (!response || response.status === 204) return null;
  if (!response.ok) return null;
  return (await response.json()) as Today;
};

export const orderPhoto = async (
  uri: string,
  reactions: Reaction[],
  langMode: LangMode,
  sample?: string,
) => {
  const reduced = await reducePhoto(uri);
  if (!reduced) return "rejected" as const;
  const lang = langMode === "en" ? "en" : "ja";
  const today = todayKey();
  const stored = await loadArrived();
  const response = await authed("/orders", {
    method: "POST",
    body: JSON.stringify({
      localDate: today,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      fragments: reduced.fragments,
      say: freeSay(allPoems, reactions, arrivedNotes(stored)),
      lang,
      ...(sample?.trim() ? { sample: sample.trim() } : {}),
    }),
  });
  if (response?.status === 409) return "full" as const;
  if (!response || response.status !== 204) return "refused" as const;
  const existing = stored.find((item) => item.day === today);
  await saveArrived({
    day: today,
    lang,
    thumb: reduced.thumb,
    body: existing?.body ?? "",
    seen: existing?.seen ?? false,
    see: reduced.fragments.see,
    sentiment: existing?.sentiment,
    reason: existing?.reason ?? "",
    scene: existing?.scene ?? false,
    explains: existing?.explains ?? false,
    missed: false,
    notedAt: existing?.notedAt,
  });
  return "sent" as const;
};

let watching: Promise<Arrived | null> | null = null;

export const watchArrival = () => {
  watching ??= (async () => {
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        let today: Today;
        try {
          today = await takeToday();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
        if (today?.status === "届ける" && today.body) {
          const day = todayKey();
          const current = (await loadArrived()).find((item) => item.day === day);
          const arrived: Arrived = {
            day,
            lang: today.lang,
            thumb: current?.thumb ?? "",
            body: today.body,
            seen: false,
            see: current?.see ?? [],
            sentiment: current?.sentiment,
            reason: current?.reason ?? "",
            scene: current?.scene ?? false,
            explains: current?.explains ?? false,
            missed: false,
            notedAt: current?.notedAt,
          };
          await saveArrived(arrived);
          return arrived;
        }
        if (today?.status === "失敗") {
          const day = todayKey();
          const current = (await loadArrived()).find((item) => item.day === day);
          if (current && !current.missed) await saveArrived({ ...current, missed: true });
          return null;
        }
        if (!today || today.status === "渡した") return null;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return null;
    } finally {
      watching = null;
    }
  })();
  return watching;
};
