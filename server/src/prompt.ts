import type { Fragments } from "../../domain/fragments.ts";
import type { SayTag, SeeTag } from "../../domain/types.ts";

const seeJa: Record<SeeTag, string> = {
  light: "光",
  water: "水",
  indoor: "室内",
  street: "街",
  plant: "植物",
  food: "食べ物",
  sky: "空",
  morning: "朝",
  day: "昼",
  evening: "夕方",
  night: "夜",
  person: "人",
  object: "物",
  ordinary: "日常",
  scenery: "景色",
};

const seeEn: Record<SeeTag, string> = {
  light: "light",
  water: "water",
  indoor: "indoors",
  street: "a street",
  plant: "plants",
  food: "food",
  sky: "sky",
  morning: "morning",
  day: "day",
  evening: "evening",
  night: "night",
  person: "a person",
  object: "an object",
  ordinary: "the ordinary",
  scenery: "a view",
};

const sayJa: Record<SayTag, string> = {
  short_line: "短い行",
  names_feeling: "感情に名前がある",
  one_leap: "一段の飛躍",
  stops: "余白で止まる",
  explains: "説明が多い",
  rhyme: "韻",
  shichigo: "七五",
};

const sayEn: Record<SayTag, string> = {
  short_line: "short lines",
  names_feeling: "feelings named",
  one_leap: "one leap",
  stops: "a stop",
  explains: "explanation",
  rhyme: "rhyme",
  shichigo: "a counted rhythm",
};

const seasonJa = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" } as const;

export const promptFor = (input: {
  fragments: Fragments;
  say: Partial<Record<SayTag, number>>;
  lang: "ja" | "en";
  sample?: string | null;
}) => {
  const seen = input.fragments.see.map((tag) => (input.lang === "ja" ? seeJa[tag] : seeEn[tag]));
  const person =
    input.lang === "ja"
      ? input.fragments.person
        ? "いる"
        : "いない"
      : input.fragments.person
        ? "present"
        : "absent";
  const season = input.lang === "ja" ? seasonJa[input.fragments.season] : input.fragments.season;
  const way = Object.entries(input.say)
    .filter((entry): entry is [SayTag, number] => typeof entry[1] === "number")
    .map(([tag, score]) => `${input.lang === "ja" ? sayJa[tag] : sayEn[tag]} ${score}`)
    .join(input.lang === "ja" ? "、" : ", ");
  const sample = input.sample?.trim();
  if (input.lang === "en") {
    return [
      "Write one free-verse poem in English, six to twelve lines.",
      "Separate lines with line breaks. Do not add a title, a note, a bullet list, or a list of things.",
      "Do not imitate a particular poet. Return only the poem.",
      "Move toward the higher scores and away from the lower ones.",
      "Do not use the names under Seen as words in the poem. Use words one step away from them.",
      "",
      `Seen: ${seen.join(", ") || "unspecified"}`,
      `Person: ${person}`,
      `Season: ${season}`,
      `Scores: ${way || "none"}`,
      ...(sample
        ? ["", "Lean toward the sample's words, and away from the names under Seen. Do not copy a line of the sample.", sample]
        : []),
    ].join("\n");
  }
  return [
    "自由詩を、日本語で、六行から十二行、書く。",
    "各行は改行で分ける。題名、説明、箇条書き、物の一覧は書かない。",
    "特定の詩人の口調は真似ない。詩だけを返す。",
    "得点が高い言い方に寄せ、低い言い方からは離れる。",
    "見ることの名は詩に書かない。そこから一段離れた言葉を使う。",
    "",
    `見ること: ${seen.join("、") || "指定なし"}`,
    `人: ${person}`,
    `季節: ${season}`,
    `言い方の得点: ${way || "なし"}`,
    ...(sample
      ? ["", "見本の言葉へ寄せ、見ることの名からは離れる。見本の行はそのまま書かない。", sample]
      : []),
  ].join("\n");
};
