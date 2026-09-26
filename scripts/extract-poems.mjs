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

const byTitle = (map, title) => {
  const want = title.replace(/\s+/g, "");
  const key = [...map.keys()].find((item) => item.replace(/\s+/g, "") === want);
  if (!key) throw new Error(`missing poem ${title}`);
  return map.get(key).split("\n○\n")[0].trim();
};

const tankaLine = (html, start) => {
  const line = textOf(stripRuby(mainChunk(html))).split("\n").find((item) => item.startsWith(start));
  if (!line) throw new Error(`missing tanka ${start}`);
  return line;
};

const verseBlock = (text, startLine, stop) => {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.replace(/\s{2,}\d+\s*$/, "").trim() === startLine);
  if (index < 0) throw new Error(`missing ${startLine}`);
  const body = [];
  for (const raw of lines.slice(index)) {
    const trimmed = raw.replace(/\s{2,}\d+\s*$/, "").trim();
    if (body.length > 0 && stop(trimmed)) break;
    if (!trimmed) {
      if (body.length && body.at(-1) !== "") body.push("");
      continue;
    }
    body.push(trimmed);
  }
  while (body.at(-1) === "") body.pop();
  return body.join("\n").replace(/\n{3,}/g, "\n\n");
};

const romanPoem = (text, numeral) => {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((line) => new RegExp(`^\\s{10,}${numeral}$`).test(line));
  if (head < 0) throw new Error(`missing ${numeral}`);
  const body = [];
  for (const raw of lines.slice(head + 1)) {
    if (/^\s{10,}[IVXLC]+$/.test(raw)) break;
    const trimmed = raw.trim();
    if (!trimmed) {
      if (body.length && body.at(-1) !== "") body.push("");
      continue;
    }
    body.push(trimmed);
  }
  while (body.at(-1) === "") body.pop();
  return body.join("\n");
};

const epitaph = (text, name) => {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === name);
  if (index < 0) throw new Error(`missing ${name}`);
  const body = [];
  let blanks = 0;
  for (const raw of lines.slice(index + 1)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      blanks += 1;
      if (body.length && body.at(-1) !== "") body.push("");
      continue;
    }
    if (body.length && blanks >= 2 && trimmed.length < 48 && !/[.!?,"—-]$/.test(trimmed)) break;
    blanks = 0;
    body.push(trimmed);
  }
  while (body[0] === "") body.shift();
  while (body.at(-1) === "") body.pop();
  return body.join("\n");
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

const [yagiwa, haru, seisan, hakuyo, shuncho, tenchi, tsuyu, oote, senge, crane, keats, wordsworth, masters] =
  await Promise.all([
    fetchText("https://www.aozora.gr.jp/cards/000026/files/894_28272.html"),
    fetchText("https://www.aozora.gr.jp/cards/000081/files/1058_15403.html"),
    fetchText("https://www.aozora.gr.jp/cards/000136/files/731_50613.html"),
    fetchText("https://www.aozora.gr.jp/cards/000150/files/50558_61357.html"),
    fetchText("https://www.aozora.gr.jp/cards/001055/files/46161_54994.html"),
    fetchText("https://www.aozora.gr.jp/cards/001081/files/42233_38066.html"),
    fetchText("https://www.aozora.gr.jp/cards/001059/files/56884_63901.html"),
    fetchText("https://www.aozora.gr.jp/cards/000190/files/1029_20618.html"),
    fetchText("https://www.aozora.gr.jp/cards/000617/files/48569_33319.html"),
    fetchText("https://www.gutenberg.org/cache/epub/40786/pg40786.txt"),
    fetchText("https://www.gutenberg.org/cache/epub/23684/pg23684.txt"),
    fetchText("https://www.gutenberg.org/cache/epub/8824/pg8824.txt"),
    fetchText("https://www.gutenberg.org/cache/epub/1280/pg1280.txt"),
  ]);

const chuyaPoems = headingPoems(yagiwa);
const kenjiPoems = headingPoems(haru);
const bochoPoems = headingPoems(seisan);
const hakuyoPoems = headingPoems(hakuyo);
const shunchoPoems = headingPoems(shuncho);
const tenchiPoems = headingPoems(tenchi);
const sengePoems = headingPoems(senge);
const ooteText = textOf(mainChunk(oote));

const chuyaSource = {
  poet: "中原中也",
  source: "中原中也詩集",
  sourceYear: 1981,
  origin: "https://www.aozora.gr.jp/cards/000026/files/894_28272.html",
  deathYear: 1937,
  form: "free",
  lang: "ja",
};
const kenjiSource = {
  poet: "宮沢賢治",
  source: "宮沢賢治全集1",
  sourceYear: 1986,
  origin: "https://www.aozora.gr.jp/cards/000081/files/1058_15403.html",
  deathYear: 1933,
  form: "free",
  lang: "ja",
};
const bochoSource = {
  poet: "山村暮鳥",
  source: "山村暮鳥全集第一巻",
  sourceYear: 1989,
  origin: "https://www.aozora.gr.jp/cards/000136/files/731_50613.html",
  deathYear: 1924,
  form: "free",
  lang: "ja",
};
const ooteSource = {
  poet: "大手拓次",
  source: "世界の詩 28 大手拓次詩集",
  sourceYear: 1965,
  origin: "https://www.aozora.gr.jp/cards/000190/files/1029_20618.html",
  deathYear: 1934,
  form: "free",
  lang: "ja",
};
const sengeSource = {
  poet: "千家元麿",
  source: "日本現代文學全集 54 千家元麿・山村暮鳥・佐藤惣之助・福士幸次郎・堀口大學集",
  sourceYear: 1966,
  origin: "https://www.aozora.gr.jp/cards/000617/files/48569_33319.html",
  deathYear: 1948,
  form: "free",
  lang: "ja",
};
const susukidaSource = {
  poet: "薄田泣菫",
  source: "白羊宮",
  sourceYear: 1906,
  origin: "https://www.aozora.gr.jp/cards/000150/files/50558_61357.html",
  deathYear: 1945,
  form: "fixed",
  lang: "ja",
  say: ["shichigo"],
};
const ariakeSource = {
  poet: "蒲原有明",
  source: "日本現代文學全集 22 土井晩翠・薄田泣菫・蒲原有明・伊良子清白・横瀬夜雨集",
  sourceYear: 1968,
  origin: "https://www.aozora.gr.jp/cards/001055/files/46161_54994.html",
  deathYear: 1952,
  form: "fixed",
  lang: "ja",
  say: ["shichigo"],
};
const bansuiSource = {
  poet: "土井晩翠",
  source: "明治文學全集 58 土井晩翠 薄田泣菫 蒲原有明集",
  sourceYear: 1967,
  origin: "https://www.aozora.gr.jp/cards/001081/files/42233_38066.html",
  deathYear: 1952,
  form: "fixed",
  lang: "ja",
  say: ["shichigo"],
};
const mokichiSource = {
  poet: "斎藤茂吉",
  source: "歌集　つゆじも",
  sourceYear: 2004,
  origin: "https://www.aozora.gr.jp/cards/001059/files/56884_63901.html",
  deathYear: 1953,
  form: "tanka",
  lang: "ja",
  title: "",
  say: ["short_line", "stops"],
};
const craneSource = {
  poet: "Stephen Crane",
  source: "The Black Riders, and Other Lines",
  sourceYear: 1895,
  origin: "https://www.gutenberg.org/cache/epub/40786/pg40786.txt",
  deathYear: 1900,
  form: "free",
  lang: "en",
  title: "",
};
const mastersSource = {
  poet: "Edgar Lee Masters",
  source: "Spoon River Anthology",
  sourceYear: 1915,
  origin: "https://www.gutenberg.org/cache/epub/1280/pg1280.txt",
  deathYear: 1950,
  form: "free",
  lang: "en",
};
const keatsSource = {
  poet: "John Keats",
  source: "Poems Published in 1820",
  sourceYear: 1820,
  origin: "https://www.gutenberg.org/cache/epub/23684/pg23684.txt",
  deathYear: 1821,
  form: "fixed",
  lang: "en",
  say: ["rhyme"],
};
const wordsworthSource = {
  poet: "William Wordsworth",
  source: "Poems in Two Volumes, Volume 2",
  sourceYear: 1807,
  origin: "https://www.gutenberg.org/cache/epub/8824/pg8824.txt",
  deathYear: 1850,
  form: "fixed",
  lang: "en",
  say: ["rhyme"],
};

add({
  id: "free-chuya-circus",
  ...chuyaSource,
  title: "サーカス",
  body: pick(chuyaPoems, "サーカス"),
  see: ["night", "person", "ordinary"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-chuya-asa",
  ...chuyaSource,
  title: "朝の歌",
  body: pick(chuyaPoems, "朝の歌"),
  see: ["morning", "light", "sky"],
  say: ["names_feeling", "stops"],
});
add({
  id: "free-kenji-kussetsu",
  ...kenjiSource,
  title: "屈折率",
  body: pick(kenjiPoems, "屈折率"),
  see: ["water", "sky", "scenery"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-kenji-kurakake",
  ...kenjiSource,
  title: "くらかけの雪",
  body: pick(kenjiPoems, "くらかけの雪"),
  see: ["sky", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-bocho-dansu",
  ...bochoSource,
  title: "だんす",
  body: pick(bochoPoems, "だんす"),
  see: ["sky", "light", "plant"],
  say: ["short_line", "one_leap", "stops"],
});
add({
  id: "free-bocho-nanohana",
  ...bochoSource,
  title: "風景",
  body: byTitle(bochoPoems, "風景純銀もざいく"),
  see: ["plant", "sky", "day", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-oote-gama",
  ...ooteSource,
  title: "藍色の蟇",
  body: betweenTitles(ooteText, "藍色の蟇", "陶器の鴉"),
  see: ["indoor", "plant", "person"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-senge-kuruma",
  ...sengeSource,
  title: "車の音",
  body: pick(sengePoems, "車の音"),
  see: ["night", "street", "ordinary", "morning"],
  say: ["explains"],
});
add({
  id: "tanka-mokichi-furo",
  ...mokichiSource,
  body: tankaLine(tsuyu, "据風呂を買ひに行きつつ"),
  see: ["indoor", "evening", "ordinary"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "tanka-mokichi-ame",
  ...mokichiSource,
  body: tankaLine(tsuyu, "かりずみのねむりは浅く"),
  see: ["night", "water", "street"],
  say: ["short_line", "stops"],
});
add({
  id: "fixed-susukida-fuyu",
  ...susukidaSource,
  title: "冬の日",
  body: pick(hakuyoPoems, "冬の日"),
  see: ["day", "water", "plant", "sky"],
});
add({
  id: "fixed-susukida-yugoe",
  ...susukidaSource,
  title: "夕ごゑ",
  body: pick(hakuyoPoems, "夕ごゑ"),
  see: ["evening", "sky", "light", "scenery"],
});
add({
  id: "fixed-ariake-chinchoge",
  ...ariakeSource,
  title: "沈丁花",
  body: pick(shunchoPoems, "沈丁花"),
  see: ["night", "plant", "person", "light"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-ariake-icho",
  ...ariakeSource,
  title: "銀杏樹",
  body: pick(shunchoPoems, "銀杏樹"),
  see: ["plant", "sky"],
});
add({
  id: "fixed-bansui-hoshi",
  ...bansuiSource,
  title: "星と花",
  body: pick(tenchiPoems, "星と花"),
  see: ["sky", "plant", "night", "light"],
});
add({
  id: "fixed-bansui-yusei",
  ...bansuiSource,
  title: "夕の星",
  body: pick(tenchiPoems, "夕の星"),
  see: ["evening", "sky", "light"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "free-crane-riders",
  ...craneSource,
  body: romanPoem(crane, "I"),
  see: ["water", "scenery"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-crane-desert",
  ...craneSource,
  body: romanPoem(crane, "III"),
  see: ["scenery", "person"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "free-masters-fiddler",
  ...mastersSource,
  title: "Fiddler Jones",
  body: epitaph(masters, "Fiddler Jones"),
  see: ["plant", "person", "ordinary", "scenery"],
  say: ["explains", "names_feeling"],
});
add({
  id: "free-masters-matlock",
  ...mastersSource,
  title: "Lucinda Matlock",
  body: epitaph(masters, "Lucinda Matlock"),
  see: ["person", "plant", "water", "night"],
  say: ["explains", "names_feeling", "stops"],
});
add({
  id: "fixed-keats-autumn",
  ...keatsSource,
  title: "To Autumn",
  body: verseBlock(keats, "Season of mists and mellow fruitfulness,", (line) => line === "ODE ON MELANCHOLY."),
  see: ["plant", "day", "evening", "sky", "scenery"],
  say: ["rhyme", "stops"],
});
add({
  id: "fixed-keats-melancholy",
  ...keatsSource,
  title: "Ode on Melancholy",
  body: verseBlock(keats, "No, no, go not to Lethe, neither twist", (line) => line === "HYPERION."),
  see: ["night", "plant", "sky"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-wordsworth-cloud",
  ...wordsworthSource,
  title: "I wandered lonely as a Cloud",
  body: verseBlock(wordsworth, "I wandered lonely as a Cloud", (line) => line === "8."),
  see: ["plant", "water", "day", "scenery"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-wordsworth-reaper",
  ...wordsworthSource,
  title: "The Solitary Reaper",
  body: verseBlock(wordsworth, "Behold her, single in the field,", (line) => line.startsWith("3.")),
  see: ["plant", "person", "scenery"],
  say: ["rhyme", "names_feeling"],
});

const ids = new Set();
for (const poem of poems) {
  if (ids.has(poem.id)) throw new Error(`duplicate id ${poem.id}`);
  ids.add(poem.id);
  if (!poem.body || poem.body.length < 8) throw new Error(`empty ${poem.id}`);
  if (/project gutenberg/i.test(poem.body)) throw new Error(`license leaked ${poem.id}`);
}
writeFileSync(new URL("../data/poems.json", import.meta.url), `${JSON.stringify(poems, null, 2)}\n`);
console.log(poems.map((poem) => `${poem.id} ${poem.title || poem.body.slice(0, 18)} (${poem.body.length})`).join("\n"));
