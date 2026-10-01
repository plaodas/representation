import { freeSay } from "../domain/selectNext";
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

export const orderPhoto = async (uri: string, reactions: Reaction[], langMode: LangMode) => {
  const reduced = await reducePhoto(uri);
  if (!reduced) return "rejected" as const;
  const lang = langMode === "en" ? "en" : "ja";
  const existing = await loadArrived();
  await saveArrived({
    day: todayKey(),
    lang,
    thumb: reduced.thumb,
    body: existing?.day === todayKey() ? existing.body : "",
    seen: false,
  });
  const response = await authed("/orders", {
    method: "POST",
    body: JSON.stringify({
      localDate: todayKey(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      fragments: reduced.fragments,
      say: freeSay(allPoems, reactions),
      lang,
    }),
  });
  if (!response || response.status !== 204) return "refused" as const;
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
          const current = await loadArrived();
          const arrived: Arrived = {
            day: todayKey(),
            lang: today.lang,
            thumb: current?.day === todayKey() ? current.thumb : "",
            body: today.body,
            seen: false,
          };
          await saveArrived(arrived);
          return arrived;
        }
        if (!today || today.status === "失敗" || today.status === "渡した") return null;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return null;
    } finally {
      watching = null;
    }
  })();
  return watching;
};
