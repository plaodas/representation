export const forms = ["free", "haiku", "tanka", "fixed"] as const;

export type Form = (typeof forms)[number];

export type Lang = "ja" | "en";

export const seeTags = [
  "light",
  "water",
  "indoor",
  "street",
  "plant",
  "food",
  "sky",
  "morning",
  "day",
  "evening",
  "night",
  "person",
  "object",
  "ordinary",
  "scenery",
] as const;

export type SeeTag = (typeof seeTags)[number];

export const sayTags = [
  "short_line",
  "names_feeling",
  "one_leap",
  "stops",
  "explains",
  "rhyme",
  "shichigo",
] as const;

export type SayTag = (typeof sayTags)[number];

export type Poem = {
  id: string;
  body: string;
  form: Form;
  lang: Lang;
  title: string;
  poet: string;
  source: string;
  sourceYear: number;
  origin: string;
  deathYear: number;
  see: SeeTag[];
  say: SayTag[];
  order: number;
};

export type Sentiment = "like" | "dislike";

export type Reaction = {
  poemId: string;
  sentiment: Sentiment;
  reason: string;
  updatedAt: string;
};

export type ReadState = {
  shownIds: string[];
  lastPoemId: string | null;
  day: string | null;
  countToday: number;
};

export const emptyRead = (): ReadState => ({
  shownIds: [],
  lastPoemId: null,
  day: null,
  countToday: 0,
});

export const formLabel: Record<Form, string> = {
  free: "自由詩",
  haiku: "俳句",
  tanka: "短歌",
  fixed: "定型",
};

export const seeLabel: Record<SeeTag, string> = {
  light: "光",
  water: "水",
  indoor: "室内",
  street: "街",
  plant: "植物",
  food: "食",
  sky: "空",
  morning: "朝",
  day: "昼",
  evening: "夕方",
  night: "夜",
  person: "人がいる",
  object: "物だけ",
  ordinary: "ありふれた物",
  scenery: "景色",
};

export const sayLabel: Record<SayTag, string> = {
  short_line: "行が短い",
  names_feeling: "気持ちを名指しする",
  one_leap: "一行だけずらす",
  stops: "そこで止める",
  explains: "説明を残す",
  rhyme: "脚韻がある",
  shichigo: "七五で進む",
};
