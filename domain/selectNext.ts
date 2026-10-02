import { forms, seeTags, type Form, type LangMode, type Poem, type Reaction, type ReadState, type SayTag, type SeeTag } from "./types.ts";

export const likeThreshold = 8;

export const photoLikeThreshold = 15;

export const likeCount = (reactions: Reaction[]) =>
  reactions.filter((reaction) => reaction.sentiment === "like").length;

export type ArrivedNote = {
  see: SeeTag[];
  scene: boolean;
  explains: boolean;
};

export const arrivedNotes = (
  rows: { see?: readonly string[]; scene?: boolean; explains?: boolean }[],
): ArrivedNote[] =>
  rows.flatMap((row) => {
    if (!row.scene && !row.explains) return [];
    const see = (row.see ?? []).filter((tag): tag is SeeTag => seeTags.includes(tag as SeeTag));
    return [{ see, scene: row.scene === true, explains: row.explains === true }];
  });

export const freeSay = (poems: Poem[], reactions: Reaction[], notes: ArrivedNote[] = []) => {
  const { say } = weights(poems, reactions, "free", notes);
  return Object.fromEntries(say) as Partial<Record<SayTag, number>>;
};

const alternates = (form: Form) => form === "free" || form === "fixed";

const poemMap = (poems: Poem[]) => new Map(poems.map((poem) => [poem.id, poem]));

const likesInForm = (poems: Poem[], reactions: Reaction[], form: Form) => {
  const byId = poemMap(poems);
  return reactions.filter(
    (reaction) =>
      reaction.sentiment === "like" && byId.get(reaction.poemId)?.form === form,
  ).length;
};

const weights = (poems: Poem[], reactions: Reaction[], form: Form, notes: ArrivedNote[] = []) => {
  const byId = poemMap(poems);
  const see = new Map<SeeTag, number>();
  const say = new Map<SayTag, number>();
  for (const reaction of reactions) {
    const poem = byId.get(reaction.poemId);
    if (!poem) continue;
    const delta = reaction.sentiment === "like" ? 1 : -1;
    for (const tag of poem.see) see.set(tag, (see.get(tag) ?? 0) + delta);
    if (poem.form === form) {
      for (const tag of poem.say) say.set(tag, (say.get(tag) ?? 0) + delta);
    }
  }
  for (const note of notes) {
    if (note.scene) {
      for (const tag of note.see) see.set(tag, (see.get(tag) ?? 0) + 1);
    }
    if (note.explains && form === "free") {
      say.set("explains", (say.get("explains") ?? 0) - 1);
    }
  }
  return { see, say };
};

const scoreOf = (
  poem: Poem,
  see: Map<SeeTag, number>,
  say: Map<SayTag, number>,
) =>
  poem.see.reduce((sum, tag) => sum + (see.get(tag) ?? 0), 0) +
  poem.say.reduce((sum, tag) => sum + (say.get(tag) ?? 0), 0);

const lastIndex = (ids: string[], id: string) => {
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    if (ids[index] === id) return index;
  }
  return -1;
};

const avoidPoet = (candidates: Poem[], poet: string | null) => {
  if (!poet) return candidates;
  const others = candidates.filter((poem) => poem.poet !== poet);
  return others.length > 0 ? others : candidates;
};

const byOrder = (a: Poem, b: Poem) => a.order - b.order;

export const nextForm = (form: Form, langMode: LangMode = "mix"): Form => {
  const allowed = langMode === "en" ? new Set<Form>(["free", "fixed"]) : new Set<Form>(forms);
  const start = forms.indexOf(form);
  for (let step = 1; step <= forms.length; step += 1) {
    const candidate = forms[(start + step) % forms.length];
    if (allowed.has(candidate)) return candidate;
  }
  return "free";
};

export const formForLang = (form: Form, langMode: LangMode = "mix"): Form => {
  if (langMode !== "en" || form === "free" || form === "fixed") return form;
  return nextForm(form, langMode);
};

const fitsLang = (poem: Poem, form: Form, langMode: LangMode) => {
  if (poem.form !== form) return false;
  if (!alternates(form)) return poem.lang === "ja";
  if (langMode === "mix") return true;
  return poem.lang === langMode;
};

export const selectNextPoem = ({
  poems,
  reactions,
  form,
  read,
  langMode = "mix",
  notes = [],
}: {
  poems: Poem[];
  reactions: Reaction[];
  today: string;
  form: Form;
  read: ReadState;
  langMode?: LangMode;
  notes?: ArrivedNote[];
}): string => {
  const inForm = poems.filter((poem) => poem.form === form);
  if (inForm.length === 0) {
    throw new Error(`no poems for ${form}`);
  }
  const byId = poemMap(poems);
  const last = read.lastPoemId ? byId.get(read.lastPoemId) : undefined;
  const lang = !alternates(form)
    ? "ja"
    : langMode === "ja" || langMode === "en"
      ? langMode
      : last
        ? last.lang === "ja"
          ? "en"
          : "ja"
        : "ja";
  const pool = inForm.filter((poem) => poem.lang === lang);
  const source = pool.length > 0 ? pool : langMode === "mix" ? inForm : pool;
  if (source.length === 0) throw new Error(`no poems for ${form} ${langMode}`);
  const shown = new Set(read.shownIds);
  const unread = source.filter((poem) => !shown.has(poem.id));
  const recycling = unread.length === 0;
  let candidates = recycling ? [...source] : unread;
  candidates = avoidPoet(candidates, last?.poet ?? null);

  const personalized = likesInForm(poems, reactions, form) >= likeThreshold;
  let chosen: Poem;
  if (recycling || !personalized) {
    if (recycling) {
      chosen = [...candidates].sort(
        (a, b) => lastIndex(read.shownIds, a.id) - lastIndex(read.shownIds, b.id),
      )[0];
    } else {
      chosen = [...candidates].sort(byOrder)[0];
    }
  } else {
    const { see, say } = weights(poems, reactions, form, notes);
    const ranked = [...candidates].sort((a, b) => {
      const delta = scoreOf(b, see, say) - scoreOf(a, see, say);
      return delta !== 0 ? delta : byOrder(a, b);
    });
    const surprise = read.shownIds.filter((id) => byId.get(id)?.form === form).length % 4 === 3;
    chosen = surprise && ranked.length >= 2 ? ranked[1] : ranked[0];
  }
  return chosen.id;
};

export const advanceRead = (
  read: ReadState,
  poemId: string,
  today: string,
): ReadState => {
  const shownIds = read.shownIds.filter((id) => id !== poemId);
  shownIds.push(poemId);
  const countToday = read.day === today ? read.countToday + 1 : 1;
  return {
    shownIds,
    lastPoemId: poemId,
    day: today,
    countToday,
  };
};

export const resolveOpen = (input: {
  poems: Poem[];
  reactions: Reaction[];
  today: string;
  form: Form;
  read: ReadState;
  langMode?: LangMode;
  notes?: ArrivedNote[];
}): { poemId: string; read: ReadState } => {
  const langMode = input.langMode ?? "mix";
  const last = input.read.lastPoemId
    ? input.poems.find((poem) => poem.id === input.read.lastPoemId)
    : undefined;
  if (last && input.read.day === input.today && fitsLang(last, input.form, langMode)) {
    return { poemId: last.id, read: input.read };
  }
  const poemId = selectNextPoem({ ...input, langMode });
  return { poemId, read: advanceRead(input.read, poemId, input.today) };
};
