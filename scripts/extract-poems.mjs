import { writeFileSync, readFileSync } from "node:fs";

const fetchText = async (url) => {
  const response = await fetch(url, { headers: { "User-Agent": "representation-corpus/0.1" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  let text;
  for (const encoding of ["utf-8", "shift_jis"]) {
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      break;
    } catch {
      // try the next encoding
    }
  }
  return (text ?? new TextDecoder("shift_jis").decode(buffer)).replace(/\r\n/g, "\n");
};

const stripRuby = (html) =>
  html
    .replace(/<rt>.*?<\/rt>/gs, "")
    .replace(/<rp>.*?<\/rp>/gs, "")
    .replace(/<\/?ruby>/g, "")
    .replace(/［＃.*?］/gs, "");

const mainChunk = (html) => {
  const match = html.match(
    /<div class="main_text">([\s\S]*)<\/div>\s*<div class="bibliographical_information">/,
  );
  if (!match) throw new Error("main_text missing");
  return stripRuby(match[1]);
};

const textOf = (fragment) => {
  const withBreaks = fragment
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "");
  const lines = [];
  let blank = 0;
  for (const raw of withBreaks.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[\u3000]+|[\u3000]+$/g, "");
    if (!line) {
      blank += 1;
      continue;
    }
    if (line.startsWith("（") && line.endsWith("）") && line.includes("年")) continue;
    if (blank >= 2 && lines.length > 0 && lines.at(-1) !== "") lines.push("");
    blank = 0;
    lines.push(line);
  }
  return lines.join("\n").trim();
};

const headingPoems = (html) => {
  const chunk = mainChunk(html);
  const segments = chunk.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/);
  const items = [];
  let title = "";
  let buffer = [];
  for (const segment of segments) {
    const heading = segment.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/);
    if (heading) {
      if (buffer.length) items.push([title, textOf(buffer.join(""))]);
      title = heading[1].replace(/<[^>]+>/g, "").trim();
      buffer = [];
    } else buffer.push(segment);
  }
  if (buffer.length) items.push([title, textOf(buffer.join(""))]);
  return new Map(items.filter(([, body]) => body));
};

const gutenbergSlice = (text, startMarker, endPattern) => {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`missing ${startMarker}`);
  const rest = text.slice(start + startMarker.length);
  const end = rest.search(endPattern);
  const block = rest.slice(0, end < 0 ? 1200 : end);
  const lines = [];
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim()) {
      if (lines.length && lines.at(-1) !== "") lines.push("");
      continue;
    }
    if (/^\s{6,}\S/.test(raw) && lines.length && lines.at(-1) !== "") {
      lines[lines.length - 1] = `${lines.at(-1)} ${raw.trim()}`;
    } else lines.push(raw.trim());
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const sonnet = (text, numeral) => {
  const marker = `\n${numeral}\n`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`missing sonnet ${numeral}`);
  const rest = text.slice(start + marker.length);
  const end = rest.search(/\n\s*[IVXLC]+\s*\n/);
  return rest
    .slice(0, end < 0 ? 800 : end)
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
};

const blakePoem = (text, title) => {
  const marker = `\n${title}\n`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`missing ${title}`);
  const rest = text.slice(start + marker.length);
  const end = rest.search(/\n\n[A-Z][A-Z ]{3,}\n/);
  const lines = rest
    .slice(0, end < 0 ? 900 : end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("***"));
  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
};

const betweenTitles = (text, startTitle, endTitle) => {
  const start = text.indexOf(startTitle);
  const end = text.indexOf(endTitle, start + startTitle.length);
  if (start < 0 || end < 0) throw new Error(`${startTitle} -> ${endTitle}`);
  return text
    .slice(start + startTitle.length, end)
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
};

const takuboku = (html) => {
  let chunk = stripRuby(mainChunk(html)).replace(/\r\n/g, "\n");
  chunk = chunk.replace(/<br \/>\n<br \/>/g, "\n\n§\n\n");
  chunk = chunk.replace(/<br \/>/g, "\n").replace(/<[^>]+>/g, "");
  return chunk
    .split("§")
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const verse = lines.length === 4 && lines[0].length < 16 ? lines.slice(1) : lines;
      return verse.join("\n");
    })
    .filter((block) => block.split("\n").length === 3);
};

const akikoLines = (html) => {
  const text = textOf(mainChunk(html));
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 20 && !line.includes("藤島"));
};

const hosaiLines = (html) => {
  const plain = stripRuby(html).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  return plain
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 6 && line.length < 30 && !/[。、]/.test(line));
};

const shikiLines = (html) => {
  const text = textOf(mainChunk(html));
  return text.split("\n").map((line) => line.trim()).filter((line) => line.endsWith("哉"));
};

const [tsuki, yagi, hitonigiri, midare, wakana, hosai, shiki, whitman, sonnets, blake] =
  await Promise.all([
    fetchText("https://www.aozora.gr.jp/cards/000067/files/859_21656.html"),
    fetchText("https://www.aozora.gr.jp/cards/000013/files/542_42320.html"),
    fetchText("https://www.aozora.gr.jp/cards/000153/files/816_15786.html"),
    fetchText("https://www.aozora.gr.jp/cards/000885/files/51307_47033.html"),
    fetchText("https://www.aozora.gr.jp/cards/000158/files/1508_18509.html"),
    fetchText("https://www.aozora.gr.jp/cards/000195/files/974_318.html"),
    fetchText("https://www.aozora.gr.jp/cards/000305/files/59088_76405.html"),
    fetchText("https://www.gutenberg.org/cache/epub/1322/pg1322.txt"),
    fetchText("https://www.gutenberg.org/cache/epub/1041/pg1041.txt"),
    fetchText("https://www.gutenberg.org/cache/epub/1934/pg1934.txt"),
  ]);

const hagiwara = headingPoems(tsuki);
const yagiPoems = headingPoems(yagi);
const tanka = takuboku(hitonigiri);
const akiko = akikoLines(midare);
const hosaiHaiku = hosaiLines(hosai);
const shikiHaiku = shikiLines(shiki);
const wakanaText = textOf(mainChunk(wakana));

const pick = (map, title) => {
  const body = map.get(title);
  if (!body) throw new Error(`missing poem ${title}`);
  return body.split("\n○\n")[0].trim();
};

const poems = [];
let order = 1;
const add = (poem) => poems.push({ ...poem, order: order++ });

const hagiwaraSource = {
  source: "現代詩文庫　1009　萩原朔太郎",
  sourceYear: 1975,
  origin: "https://www.aozora.gr.jp/cards/000067/files/859_21656.html",
  deathYear: 1942,
  poet: "萩原朔太郎",
};
const yagiSource = {
  source: "八木重吉詩集",
  sourceYear: 1969,
  origin: "https://www.aozora.gr.jp/cards/000013/files/542_42320.html",
  deathYear: 1927,
  poet: "八木重吉",
};

add({
  id: "free-take",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "竹",
  body: pick(hagiwara, "竹"),
  see: ["plant", "morning", "sky", "light", "scenery"],
  say: ["stops"],
});
add({
  id: "free-hana",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "花がふってくると思う",
  body: pick(yagiPoems, "花がふってくると思う"),
  see: ["plant", "sky"],
  say: ["short_line", "stops"],
});
add({
  id: "free-egg",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "卵",
  body: pick(hagiwara, "卵"),
  see: ["sky", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-yamabuki",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "山吹",
  body: pick(yagiPoems, "山吹"),
  see: ["plant", "water"],
  say: ["short_line", "stops"],
});
add({
  id: "free-tenkei",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "天景",
  body: pick(hagiwara, "天景"),
  see: ["scenery", "sky", "light"],
  say: ["stops"],
});
add({
  id: "free-neko",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "猫",
  body: pick(hagiwara, "猫"),
  see: ["night", "ordinary", "sky"],
  say: ["short_line"],
});

const whitmanSource = {
  poet: "Walt Whitman",
  source: "Leaves of Grass",
  sourceYear: 1892,
  origin: "https://www.gutenberg.org/cache/epub/1322/pg1322.txt",
  deathYear: 1892,
  form: "free",
  lang: "en",
};
add({
  id: "free-spider",
  ...whitmanSource,
  title: "A Noiseless Patient Spider",
  body: gutenbergSlice(whitman, "A Noiseless Patient Spider", /\n\n\n/),
  see: ["object", "scenery"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-astronomer",
  ...whitmanSource,
  title: "When I Heard the Learn’d Astronomer",
  body: gutenbergSlice(whitman, "When I Heard the Learn’d Astronomer", /\n\n\n/),
  see: ["night", "indoor", "sky"],
  say: ["one_leap"],
});
add({
  id: "free-oak",
  ...whitmanSource,
  title: "I Saw in Louisiana a Live-Oak Growing",
  body: gutenbergSlice(whitman, "I Saw in Louisiana a Live-Oak Growing", /\n\n\n/),
  see: ["plant", "scenery"],
  say: ["one_leap"],
});
add({
  id: "free-midnight",
  ...whitmanSource,
  title: "A Clear Midnight",
  body: gutenbergSlice(whitman, "A Clear Midnight", /\n\n\n/),
  see: ["night", "sky"],
  say: ["short_line", "stops"],
});

const shikiSource = {
  poet: "正岡子規",
  source: "花の名随筆5　五月の花",
  sourceYear: 1999,
  origin: "https://www.aozora.gr.jp/cards/000305/files/59088_76405.html",
  deathYear: 1902,
  form: "haiku",
  lang: "ja",
  say: ["short_line", "stops"],
};
const hosaiSource = {
  poet: "尾崎放哉",
  source: "尾崎放哉句集",
  sourceYear: 1997,
  origin: "https://www.aozora.gr.jp/cards/000195/files/974_318.html",
  deathYear: 1926,
  form: "haiku",
  lang: "ja",
  say: ["short_line", "stops"],
};
const haikuPairs = [
  ["haiku-shiki-usuyo", shikiSource, shikiHaiku.find((line) => line.startsWith("薄様に")), ["plant", "indoor"]],
  ["haiku-hosai-tako", hosaiSource, hosaiHaiku.find((line) => line.startsWith("きれ凧")), ["plant", "scenery"]],
  ["haiku-shiki-ichirin", shikiSource, shikiHaiku.find((line) => line.startsWith("一輪の")), ["plant", "indoor", "light"]],
  ["haiku-hosai-mizu", hosaiSource, hosaiHaiku.find((line) => line.startsWith("水打つて")), ["water", "plant", "ordinary"]],
];
for (const [id, source, body, see] of haikuPairs) {
  if (!body) throw new Error(`missing haiku ${id}`);
  add({ id, ...source, title: "", body, see });
}

const takubokuSource = {
  poet: "石川啄木",
  source: "日本文学全集12　国木田独歩・石川啄木集",
  sourceYear: 1967,
  origin: "https://www.aozora.gr.jp/cards/000153/files/816_15786.html",
  deathYear: 1912,
  form: "tanka",
  lang: "ja",
  title: "",
  say: ["short_line", "names_feeling"],
};
const akikoSource = {
  poet: "与謝野晶子",
  source: "みだれ髪",
  sourceYear: 2000,
  origin: "https://www.aozora.gr.jp/cards/000885/files/51307_47033.html",
  deathYear: 1942,
  form: "tanka",
  lang: "ja",
  title: "",
  say: ["names_feeling", "stops"],
};
const tankaBodies = [
  ["tanka-kani", takubokuSource, tanka.find((block) => block.includes("蟹とたはむる")), ["water", "scenery", "person"]],
  ["tanka-sono", akikoSource, akiko.find((line) => line.startsWith("その子二十")), ["person", "plant"]],
  ["tanka-suna", takubokuSource, tanka.find((block) => block.includes("一握の砂")), ["ordinary", "person"]],
  ["tanka-kiyomizu", akikoSource, akiko.find((line) => line.startsWith("清水へ")), ["night", "street", "person", "scenery"]],
];
for (const [id, source, body, see] of tankaBodies) {
  if (!body) throw new Error(`missing tanka ${id}`);
  add({ id, ...source, body, see });
}

const tosonSource = {
  poet: "島崎藤村",
  source: "藤村詩集",
  sourceYear: 1968,
  origin: "https://www.aozora.gr.jp/cards/000158/files/1508_18509.html",
  deathYear: 1943,
  form: "fixed",
  lang: "ja",
  say: ["shichigo", "names_feeling"],
};
add({
  id: "fixed-hatsukoi",
  ...tosonSource,
  title: "初恋",
  body: betweenTitles(wakanaText, "初恋", "狐のわざ"),
  see: ["plant", "person", "day"],
});
add({
  id: "fixed-kitsune",
  ...tosonSource,
  title: "狐のわざ",
  body: betweenTitles(wakanaText, "狐のわざ", "髪を洗へば"),
  see: ["night", "plant", "person"],
});

const shakespeare = {
  poet: "William Shakespeare",
  source: "Sonnets",
  sourceYear: 1609,
  origin: "https://www.gutenberg.org/cache/epub/1041/pg1041.txt",
  deathYear: 1616,
  form: "fixed",
  lang: "en",
  say: ["rhyme", "names_feeling"],
};
add({
  id: "fixed-sonnet-18",
  ...shakespeare,
  title: "Sonnet 18",
  body: sonnet(sonnets, "XVIII"),
  see: ["light", "plant", "day"],
});
add({
  id: "fixed-sonnet-73",
  ...shakespeare,
  title: "Sonnet 73",
  body: sonnet(sonnets, "LXXIII"),
  see: ["evening", "plant", "night"],
});

const blakeSource = {
  poet: "William Blake",
  source: "Songs of Innocence and of Experience",
  sourceYear: 1794,
  origin: "https://www.gutenberg.org/cache/epub/1934/pg1934.txt",
  deathYear: 1827,
  form: "fixed",
  lang: "en",
  say: ["rhyme", "short_line"],
};
add({
  id: "fixed-lamb",
  ...blakeSource,
  title: "The Lamb",
  body: blakePoem(blake, "THE LAMB"),
  see: ["day", "ordinary", "person"],
});
add({
  id: "fixed-tyger",
  ...blakeSource,
  title: "The Tiger",
  body: blakePoem(blake, "THE TIGER"),
  see: ["night", "light", "sky"],
});

for (const poem of poems) {
  if (!poem.body || poem.body.length < 8) throw new Error(`empty ${poem.id}`);
  if (/project gutenberg/i.test(poem.body)) throw new Error(`license leaked ${poem.id}`);
}
writeFileSync(new URL("../data/poems.json", import.meta.url), `${JSON.stringify(poems, null, 2)}\n`);
console.log(poems.map((poem) => `${poem.id} ${poem.title || poem.body.slice(0, 18)} (${poem.body.length})`).join("\n"));
