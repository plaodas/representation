import type { Form, Poem, Reaction, ReadState, SayTag, SeeTag } from "./types";

export const likeThreshold = 8;

const alternates = (form: Form) => form === "free" || form === "fixed";

const poemMap = (poems: Poem[]) => new Map(poems.map((poem) => [poem.id, poem]));

const likesInForm = (poems: Poem[], reactions: Reaction[], form: Form) => {
  const byId = poemMap(poems);
  return reactions.filter(
    (reaction) =>
      reaction.sentiment === "like" && byId.get(reaction.poemId)?.form === form,
  ).length;
};

const weights = (poems: Poem[], reactions: Reaction[], form: Form) => {
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

export const selectNextPoem = ({
  poems,
  reactions,
  form,
  read,
}: {
  poems: Poem[];
  reactions: Reaction[];
  today: string;
  form: Form;
  read: ReadState;
}): string => {
  const inForm = poems.filter((poem) => poem.form === form);
  if (inForm.length === 0) {
    throw new Error(`no poems for ${form}`);
  }
  const byId = poemMap(poems);
  const last = read.lastPoemId ? byId.get(read.lastPoemId) : undefined;
  const lang =
    alternates(form) && last ? (last.lang === "ja" ? "en" : "ja") : "ja";
  const pool = inForm.filter((poem) => poem.lang === lang);
  const source = pool.length > 0 ? pool : inForm;
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
    const { see, say } = weights(poems, reactions, form);
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
}): { poemId: string; read: ReadState } => {
  if (input.read.lastPoemId && input.read.day === input.today) {
    return { poemId: input.read.lastPoemId, read: input.read };
  }
  const poemId = selectNextPoem(input);
  return { poemId, read: advanceRead(input.read, poemId, input.today) };
};
