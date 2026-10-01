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

const kanzanLine = (html, start) => {
  const line = html
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(start));
  if (!line || line.includes("※")) throw new Error(`missing kanzan ${start}`);
  return line;
};

const yosamuLine = (html, start) => {
  const line = [...mainChunk(html).matchAll(/<div class="jisage_3"[^>]*>\s*([^<\n]+)/g)]
    .map((item) => item[1].trim())
    .find((item) => item.startsWith(start));
  if (!line) throw new Error(`missing yosamu ${start}`);
  return line;
};

const titledVerse = (text, title) => {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line === title);
  if (index < 0) throw new Error(`missing ${title}`);
  const body = [];
  for (const raw of lines.slice(index + 1)) {
    if (raw.trim() && !/^\s/.test(raw)) break;
    const trimmed = raw.trim();
    if (!trimmed) {
      if (body.length && body.at(-1) !== "") body.push("");
      continue;
    }
    body.push(trimmed);
  }
  while (body[0] === "") body.shift();
  while (body.at(-1) === "") body.pop();
  return body.join("\n");
};

const [kanzan, yosamu, lowell, lawrence, stevens] = await Promise.all([
  fetchText("https://www.aozora.gr.jp/cards/000305/files/1896.html"),
  fetchText("https://www.aozora.gr.jp/cards/000305/files/42168_12297.html"),
  fetchText("https://www.gutenberg.org/cache/epub/1020/pg1020.txt"),
  fetchText("https://www.gutenberg.org/cache/epub/60337/pg60337.txt"),
  fetchText("https://www.gutenberg.org/cache/epub/78743/pg78743.txt"),
]);

const kanzanSource = {
  poet: "正岡子規",
  source: "子規全集　第一巻　俳句一",
  sourceYear: 1975,
  origin: "https://www.aozora.gr.jp/cards/000305/files/1896.html",
  deathYear: 1902,
  form: "haiku",
  lang: "ja",
  title: "",
  say: ["short_line", "stops"],
};
const yosamuSource = {
  poet: "正岡子規",
  source: "日本の名随筆72　夜",
  sourceYear: 1988,
  origin: "https://www.aozora.gr.jp/cards/000305/files/42168_12297.html",
  deathYear: 1902,
  form: "haiku",
  lang: "ja",
  title: "",
  say: ["short_line", "stops"],
};
const lowellSource = {
  poet: "Amy Lowell",
  source: "Sword Blades and Poppy Seed",
  sourceYear: 1914,
  origin: "https://www.gutenberg.org/cache/epub/1020/pg1020.txt",
  deathYear: 1925,
  form: "free",
  lang: "en",
};
const lawrenceSource = {
  poet: "D. H. Lawrence",
  source: "Birds, Beasts and Flowers",
  sourceYear: 1923,
  origin: "https://www.gutenberg.org/cache/epub/60337/pg60337.txt",
  deathYear: 1930,
  form: "free",
  lang: "en",
};
const stevensSource = {
  poet: "Wallace Stevens",
  source: "Harmonium",
  sourceYear: 1923,
  origin: "https://www.gutenberg.org/cache/epub/78743/pg78743.txt",
  deathYear: 1955,
  form: "free",
  lang: "en",
};

add({
  id: "haiku-shiki-asagiri",
  ...kanzanSource,
  body: kanzanLine(kanzan, "朝霧の中に九段のともし哉"),
  see: ["morning", "street", "light"],
});
add({
  id: "haiku-shiki-nekoron",
  ...kanzanSource,
  body: kanzanLine(kanzan, "ねころんて書よむ人や春の草"),
  see: ["person", "plant", "day"],
});
add({
  id: "haiku-shiki-ennichi",
  ...yosamuSource,
  body: yosamuLine(yosamu, "縁日の古著屋多き夜寒かな"),
  see: ["evening", "street", "ordinary"],
});
add({
  id: "haiku-shiki-kintsuba",
  ...yosamuSource,
  body: yosamuLine(yosamu, "きんつばの行燈暗き夜寒かな"),
  see: ["night", "food", "light", "street"],
});
add({
  id: "haiku-shiki-dentou",
  ...yosamuSource,
  body: yosamuLine(yosamu, "電気燈明るき山の夜寒かな"),
  see: ["night", "light", "scenery"],
});
add({
  id: "haiku-shiki-kashi",
  ...yosamuSource,
  body: yosamuLine(yosamu, "樫の木の中に灯ともる夜寒かな"),
  see: ["night", "plant", "light"],
});
add({
  id: "tanka-takuboku-ochiru",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("いのちなき砂のかなしさよ")),
  see: ["ordinary", "person"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "tanka-takuboku-namida",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("なみだを吸へる砂の玉")),
  see: ["ordinary", "person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "tanka-akiko-kami",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("髪五尺ときなば水に")),
  see: ["water", "person"],
});
add({
  id: "tanka-akiko-tsubaki",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("椿それも梅もさなりき")),
  see: ["plant", "person"],
});
add({
  id: "tanka-mokichi-shimo",
  ...mokichiSource,
  body: tankaLine(tsuyu, "わが住める家のいらかの白霜を"),
  see: ["indoor", "day"],
});
add({
  id: "tanka-mokichi-haari",
  ...mokichiSource,
  body: tankaLine(tsuyu, "電灯にむれとべる羽蟻"),
  see: ["indoor", "night", "light", "ordinary"],
});
add({
  id: "free-lowell-taxi",
  ...lowellSource,
  title: "The Taxi",
  body: titledVerse(lowell, "The Taxi"),
  see: ["night", "street", "person"],
  say: ["names_feeling", "short_line", "stops"],
});
add({
  id: "free-lowell-pike",
  ...lowellSource,
  title: "The Pike",
  body: titledVerse(lowell, "The Pike"),
  see: ["water", "plant", "light", "day"],
  say: ["short_line", "stops"],
});
add({
  id: "free-lawrence-night",
  ...lawrenceSource,
  title: "Southern Night",
  body: titledVerse(lawrence, "SOUTHERN NIGHT"),
  see: ["night", "sky", "light"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lawrence-humming",
  ...lawrenceSource,
  title: "Humming-Bird",
  body: titledVerse(lawrence, "HUMMING-BIRD"),
  see: ["plant", "light", "scenery"],
  say: ["one_leap", "explains"],
});
add({
  id: "free-stevens-snow",
  ...stevensSource,
  title: "The Snow Man",
  body: titledVerse(stevens, "The Snow Man"),
  see: ["plant", "light", "scenery", "day"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-stevens-jar",
  ...stevensSource,
  title: "Anecdote of the Jar",
  body: titledVerse(stevens, "Anecdote of the Jar"),
  see: ["object", "scenery", "plant"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-oote-fune",
  ...ooteSource,
  title: "しなびた船",
  body: betweenTitles(ooteText, "しなびた船", "黄金の闇"),
  see: ["water", "food", "person"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-senge-hoshi",
  ...sengeSource,
  title: "星",
  body: pick(sengePoems, "星"),
  see: ["night", "sky", "street", "person", "light"],
  say: ["names_feeling", "explains"],
});
add({
  id: "fixed-toson-kami",
  ...tosonSource,
  title: "髪を洗へば",
  body: betweenTitles(wakanaText, "髪を洗へば", "君がこゝろは"),
  see: ["person", "plant", "food"],
});
add({
  id: "fixed-toson-kokoro",
  ...tosonSource,
  title: "君がこゝろは",
  body: betweenTitles(wakanaText, "君がこゝろは", "傘のうち"),
  see: ["person", "plant", "morning"],
});
add({
  id: "fixed-sonnet-29",
  ...shakespeare,
  title: "Sonnet 29",
  body: sonnet(sonnets, "XXIX"),
  see: ["morning", "sky", "person"],
});
add({
  id: "fixed-sonnet-116",
  ...shakespeare,
  title: "Sonnet 116",
  body: sonnet(sonnets, "CXVI"),
  see: ["sky", "water", "light"],
});

add({
  id: "haiku-shiki-komado",
  ...kanzanSource,
  body: kanzanLine(kanzan, "木をつみて夜の明やすき小窓かな"),
  see: ["morning", "indoor", "light"],
});
add({
  id: "haiku-shiki-yudachi",
  ...kanzanSource,
  body: kanzanLine(kanzan, "夕立やはちすを笠にかぶり行く"),
  see: ["water", "plant", "day"],
});
add({
  id: "haiku-shiki-kaki",
  ...yosamuSource,
  body: yosamuLine(yosamu, "柿店の前を過ぎ行く夜寒かな"),
  see: ["evening", "food", "street"],
});
add({
  id: "haiku-shiki-machi",
  ...yosamuSource,
  body: yosamuLine(yosamu, "見下せば灯の無き町の夜寒かな"),
  see: ["night", "street", "light"],
});
add({
  id: "tanka-takuboku-haha",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("母を背負ひて")),
  see: ["person", "indoor"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "tanka-takuboku-shigoto",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("我にはたらく仕事あれ")),
  see: ["person", "day"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "tanka-akiko-botan",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("まゐる酒に灯あかき宵を")),
  see: ["night", "food", "plant", "person"],
});
add({
  id: "tanka-akiko-kaido",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("海棠にえうなくときし")),
  see: ["plant", "evening", "water", "person"],
});
add({
  id: "tanka-mokichi-kawazu",
  ...mokichiSource,
  body: tankaLine(tsuyu, "ゆふぐれて浦上村をわが来れば"),
  see: ["evening", "water", "scenery"],
});
add({
  id: "tanka-mokichi-ameoto",
  ...mokichiSource,
  body: tankaLine(tsuyu, "むし暑き家のとのもに降る雨の"),
  see: ["indoor", "water", "night"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "fixed-bansui-kaido",
  ...bansuiSource,
  title: "海棠",
  body: pick(tenchiPoems, "海棠"),
  see: ["plant", "water", "evening"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-bansui-yanagi",
  ...bansuiSource,
  title: "枯柳",
  body: pick(tenchiPoems, "枯柳"),
  see: ["evening", "plant", "water"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-ariake-midori",
  ...ariakeSource,
  title: "緑のかげ",
  body: pick(shunchoPoems, "緑のかげ"),
  see: ["plant", "person", "scenery"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-susukida-keshi",
  ...susukidaSource,
  title: "雛罌粟",
  body: pick(hakuyoPoems, "雛罌粟"),
  see: ["plant"],
});
add({
  id: "fixed-blake-fly",
  ...blakeSource,
  title: "The Fly",
  body: blakePoem(blake, "THE FLY"),
  see: ["day", "person"],
});
add({
  id: "fixed-blake-rose",
  ...blakeSource,
  title: "The Sick Rose",
  body: blakePoem(blake, "THE SICK ROSE"),
  see: ["night", "plant"],
});
add({
  id: "fixed-sonnet-30",
  ...shakespeare,
  title: "Sonnet 30",
  body: sonnet(sonnets, "XXX"),
  see: ["night", "person"],
});
add({
  id: "fixed-sonnet-71",
  ...shakespeare,
  title: "Sonnet 71",
  body: sonnet(sonnets, "LXXI"),
  see: ["night", "person"],
});
add({
  id: "free-crane-tongues",
  ...craneSource,
  body: romanPoem(crane, "IV"),
  see: ["person"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "free-crane-horizon",
  ...craneSource,
  body: romanPoem(crane, "XXIV"),
  see: ["person", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-stevens-candle",
  ...stevensSource,
  title: "Valley Candle",
  body: titledVerse(stevens, "Valley Candle"),
  see: ["night", "light", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-stevens-tea",
  ...stevensSource,
  title: "Tea",
  body: titledVerse(stevens, "Tea"),
  see: ["plant", "night", "light", "indoor"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-yagi-michi",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "路",
  body: pick(yagiPoems, "路"),
  see: ["street"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "free-bocho-misaki",
  ...bochoSource,
  title: "岬",
  body: pick(bochoPoems, "岬"),
  see: ["scenery", "light", "water"],
  say: ["short_line", "one_leap", "stops"],
});

add({
  id: "haiku-shiki-harusame",
  ...kanzanSource,
  body: kanzanLine(kanzan, "春雨や柳の絲もまじるらん"),
  see: ["water", "plant"],
});
add({
  id: "haiku-shiki-meigetsu",
  ...kanzanSource,
  body: kanzanLine(kanzan, "名月の出るやゆらめく花薄"),
  see: ["night", "light", "plant"],
});
add({
  id: "haiku-shiki-ganpitsu",
  ...yosamuSource,
  body: yosamuLine(yosamu, "贋筆を掛けて灯ともす夜寒かな"),
  see: ["night", "light", "indoor"],
});
add({
  id: "haiku-shiki-kurayami",
  ...yosamuSource,
  body: yosamuLine(yosamu, "暗やみに我門敲く夜寒かな"),
  see: ["night", "indoor"],
});
add({
  id: "tanka-takuboku-tomokage",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("燈影なき室に我あり")),
  see: ["indoor", "night", "person"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "tanka-takuboku-ana",
  ...takubokuSource,
  body: tanka.find((block) => block.startsWith("いと暗き")),
  see: ["night", "person"],
  say: ["short_line", "names_feeling", "stops"],
});
add({
  id: "tanka-akiko-niji",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("紫の濃き虹説きし")),
  see: ["light", "plant", "person"],
});
add({
  id: "tanka-akiko-haru",
  ...akikoSource,
  body: akiko.find((line) => line.startsWith("春の国恋の御国の")),
  see: ["morning", "plant", "person"],
});
add({
  id: "tanka-mokichi-kane",
  ...mokichiSource,
  body: tankaLine(tsuyu, "聖福寺の鐘の音ちかしかさなれる"),
  see: ["scenery"],
});
add({
  id: "tanka-mokichi-hotaru",
  ...mokichiSource,
  body: tankaLine(tsuyu, "うなじたれて道いそぎつつこよひごろ"),
  see: ["night", "light", "person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "fixed-susukida-sekiryo",
  ...susukidaSource,
  title: "寂寥",
  body: pick(hakuyoPoems, "寂寥"),
  see: ["night", "plant", "indoor"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-susukida-nana",
  ...susukidaSource,
  title: "美き名",
  body: pick(hakuyoPoems, "美き名"),
  see: ["night", "plant", "person"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-ariake-amaryllis",
  ...ariakeSource,
  title: "あまりりす",
  body: pick(shunchoPoems, "あまりりす"),
  see: ["water", "plant", "person", "day"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-ariake-kusa",
  ...ariakeSource,
  title: "家根のくさ",
  body: pick(shunchoPoems, "家根のくさ"),
  see: ["plant", "day", "scenery"],
});
add({
  id: "fixed-keats-nightingale",
  ...keatsSource,
  title: "Ode to a Nightingale",
  body: verseBlock(keats, "My heart aches, and a drowsy numbness pains", (line) => line === "ODE ON A GRECIAN URN."),
  see: ["night", "plant", "person"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-keats-urn",
  ...keatsSource,
  title: "Ode on a Grecian Urn",
  body: verseBlock(keats, "Thou still unravish'd bride of quietness,", (line) => line === "ODE TO PSYCHE."),
  see: ["object", "plant", "person"],
});
add({
  id: "fixed-wordsworth-linnet",
  ...wordsworthSource,
  title: "The Green Linnet",
  body: verseBlock(wordsworth, "The May is come again:--how sweet", (line) => line.startsWith("_TO A YOUNG LADY_")),
  see: ["plant", "day"],
});
add({
  id: "fixed-wordsworth-daisy",
  ...wordsworthSource,
  title: "To the Daisy",
  body: verseBlock(wordsworth, "With little here to do or see", (line) => line.startsWith("_TO THE SAME FLOWER_")),
  see: ["plant", "day", "light"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "free-lowell-white",
  ...lowellSource,
  title: "White and Green",
  body: titledVerse(lowell, "White and Green"),
  see: ["plant", "day", "person", "light"],
  say: ["short_line"],
});
add({
  id: "free-lowell-aubade",
  ...lowellSource,
  title: "Aubade",
  body: titledVerse(lowell, "Aubade"),
  see: ["plant", "person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-lawrence-peace",
  ...lawrenceSource,
  title: "Peace",
  body: titledVerse(lawrence, "PEACE"),
  see: ["scenery", "light"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lawrence-tropic",
  ...lawrenceSource,
  title: "Tropic",
  body: titledVerse(lawrence, "TROPIC"),
  see: ["day", "light", "person", "water"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-kenji-ariake",
  ...kenjiSource,
  title: "有明",
  body: pick(kenjiPoems, "有明"),
  see: ["sky", "light", "scenery"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-kenji-tani",
  ...kenjiSource,
  title: "谷",
  body: pick(kenjiPoems, "谷"),
  see: ["person", "scenery"],
  say: ["short_line", "one_leap"],
});

add({
  id: "haiku-shiki-hatsuyuki",
  ...kanzanSource,
  body: kanzanLine(kanzan, "初雪やかくれおほせぬ馬の糞"),
  see: ["ordinary", "day"],
});
add({
  id: "haiku-shiki-suzume",
  ...kanzanSource,
  body: kanzanLine(kanzan, "ぬれ足で雀のあるく廊下かな"),
  see: ["indoor", "water"],
});
add({
  id: "haiku-shiki-yoiyami",
  ...kanzanSource,
  body: kanzanLine(kanzan, "宵闇や薄に月のいづる音"),
  see: ["night", "plant", "light"],
});
add({
  id: "haiku-shiki-kocho",
  ...kanzanSource,
  body: kanzanLine(kanzan, "胡蝶飛ぶ簾のうちの人もなし"),
  see: ["indoor"],
});
add({
  id: "haiku-shiki-sankai",
  ...yosamuSource,
  body: yosamuLine(yosamu, "三階の灯を消しに行く夜寒かな"),
  see: ["night", "light", "indoor"],
});
add({
  id: "haiku-shiki-koban",
  ...yosamuSource,
  body: yosamuLine(yosamu, "交番の交代時の夜寒かな"),
  see: ["night", "street", "person"],
});
add({
  id: "fixed-toson-kasa",
  ...tosonSource,
  title: "傘のうち",
  body: betweenTitles(wakanaText, "傘のうち", "歌ふをきけば"),
  see: ["person", "water"],
});
add({
  id: "fixed-toson-shiru",
  ...tosonSource,
  title: "知るや君",
  body: betweenTitles(wakanaText, "知るや君", "秋風の歌"),
  see: ["plant", "morning", "night", "sky"],
});
add({
  id: "fixed-bansui-natsu",
  ...bansuiSource,
  title: "夏夜",
  body: pick(tenchiPoems, "夏夜"),
  see: ["night", "water", "sky", "light"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-bansui-tsuki",
  ...bansuiSource,
  title: "月と戀",
  body: pick(tenchiPoems, "月と戀"),
  see: ["night", "light", "sky", "person"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-blake-london",
  ...blakeSource,
  title: "London",
  body: blakePoem(blake, "LONDON"),
  see: ["street", "night", "water", "person"],
});
add({
  id: "fixed-blake-garden",
  ...blakeSource,
  title: "The Garden of Love",
  body: blakePoem(blake, "THE GARDEN OF LOVE"),
  see: ["plant", "day", "person"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-sonnet-55",
  ...shakespeare,
  title: "Sonnet 55",
  body: sonnet(sonnets, "LV"),
  see: ["person"],
});
add({
  id: "fixed-sonnet-130",
  ...shakespeare,
  title: "Sonnet 130",
  body: sonnet(sonnets, "CXXX"),
  see: ["person", "plant", "light"],
});
add({
  id: "free-chuya-yusho",
  ...chuyaSource,
  title: "夕照",
  body: pick(chuyaPoems, "夕照"),
  see: ["evening", "scenery", "plant", "light"],
  say: ["short_line", "stops"],
});
add({
  id: "free-chuya-kikyo",
  ...chuyaSource,
  title: "帰郷",
  body: pick(chuyaPoems, "帰郷"),
  see: ["day", "scenery", "plant"],
  say: ["names_feeling"],
});
add({
  id: "free-oote-yami",
  ...ooteSource,
  title: "黄金の闇",
  body: betweenTitles(ooteText, "黄金の闇", "槍の野辺"),
  see: ["night", "person", "light"],
  say: ["names_feeling", "one_leap"],
});
add({
  id: "free-oote-sansui",
  ...ooteSource,
  title: "撒水車の小僧たち",
  body: betweenTitles(ooteText, "撒水車の小僧たち", "羊皮をきた召使"),
  see: ["street", "water", "person"],
  say: ["names_feeling", "explains"],
});
add({
  id: "free-senge-ame",
  ...sengeSource,
  title: "雨",
  body: pick(sengePoems, "雨"),
  see: ["water", "street", "night", "light"],
  say: ["stops"],
});
add({
  id: "free-senge-akanbo",
  ...sengeSource,
  title: "赤ん坊",
  body: pick(sengePoems, "赤ん坊"),
  see: ["person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-masters-anne",
  ...mastersSource,
  title: "Anne Rutledge",
  body: epitaph(masters, "Anne Rutledge"),
  see: ["person", "plant"],
  say: ["explains", "names_feeling"],
});
add({
  id: "free-masters-slack",
  ...mastersSource,
  title: "Margaret Fuller Slack",
  body: epitaph(masters, "Margaret Fuller Slack"),
  see: ["person", "indoor"],
  say: ["explains"],
});
add({
  id: "free-crane-ship",
  ...craneSource,
  body: romanPoem(crane, "VI"),
  see: ["water", "sky"],
  say: ["one_leap", "explains"],
});
add({
  id: "free-crane-learned",
  ...craneSource,
  body: romanPoem(crane, "XX"),
  see: ["person"],
  say: ["short_line", "stops"],
});

const bokusuiUta = await fetchText("https://www.aozora.gr.jp/cards/000162/files/2693_20319.html");
const bokusuiSource = {
  poet: "若山牧水",
  source: "若山牧水全集　第七卷",
  sourceYear: 1958,
  origin: "https://www.aozora.gr.jp/cards/000162/files/2693_20319.html",
  deathYear: 1928,
  form: "tanka",
  lang: "ja",
  title: "",
  say: ["short_line", "stops"],
};

add({
  id: "tanka-bokusui-konoha",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "ちひさきは小さきままに"),
  see: ["plant"],
  say: ["short_line", "one_leap"],
});
add({
  id: "tanka-bokusui-shizuku",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "おのづから湧き出づる水の"),
  see: ["water", "plant"],
});
add({
  id: "tanka-bokusui-tani",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "山にあらず海にあらず"),
  see: ["water", "scenery"],
});
add({
  id: "tanka-bokusui-osanaki",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "幼く且つ拙しとおもふ"),
  see: ["person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "haiku-shiki-kazami",
  ...kanzanSource,
  body: kanzanLine(kanzan, "散る花のうしろに動く風見哉"),
  see: ["plant", "day"],
});
add({
  id: "haiku-shiki-shimizu",
  ...kanzanSource,
  body: kanzanLine(kanzan, "底見えて小魚も住まぬ清水哉"),
  see: ["water"],
});
add({
  id: "haiku-shiki-kasa",
  ...kanzanSource,
  body: kanzanLine(kanzan, "傘に落つる櫻の雫かな"),
  see: ["water", "plant"],
});
add({
  id: "haiku-shiki-hanabi",
  ...kanzanSource,
  body: kanzanLine(kanzan, "くらがりの天地にひゞく花火哉"),
  see: ["night", "light", "sky"],
});
add({
  id: "fixed-susukida-suiren",
  ...susukidaSource,
  title: "睡蓮の歌",
  body: pick(hakuyoPoems, "睡蓮の歌"),
  see: ["water", "plant", "day", "evening"],
});
add({
  id: "fixed-susukida-umi",
  ...susukidaSource,
  title: "海のほとりにて",
  body: pick(hakuyoPoems, "海のほとりにて"),
  see: ["water", "evening", "sky"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-ariake-ochibo",
  ...ariakeSource,
  title: "日のおちぼ",
  body: pick(shunchoPoems, "日のおちぼ"),
  see: ["light", "night", "sky", "plant"],
});
add({
  id: "fixed-ariake-minato",
  ...ariakeSource,
  title: "みなといり",
  body: pick(shunchoPoems, "みなといり"),
  see: ["water", "day", "evening"],
});
add({
  id: "fixed-bansui-haruyo",
  ...bansuiSource,
  title: "はるのよ",
  body: pick(tenchiPoems, "はるのよ"),
  see: ["night", "plant", "light", "water"],
});
add({
  id: "fixed-bansui-kawa",
  ...bansuiSource,
  title: "夏の川",
  body: pick(tenchiPoems, "夏の川"),
  see: ["water", "evening", "plant", "light"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-keats-psyche",
  ...keatsSource,
  title: "Ode to Psyche",
  body: verseBlock(keats, "O Goddess! hear these tuneless numbers, wrung", (line) => line === "FANCY."),
  see: ["plant", "night", "person", "light"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-keats-mermaid",
  ...keatsSource,
  title: "The Mermaid Tavern",
  body: verseBlock(keats, "Souls of Poets dead and gone,", (line) => line === "ROBIN HOOD."),
  see: ["food", "person", "indoor"],
});
add({
  id: "fixed-wordsworth-cuckoo",
  ...wordsworthSource,
  title: "To the Cuckoo",
  body: verseBlock(wordsworth, "O blithe New-comer! I have heard,", (line) => line.startsWith("12.")),
  see: ["plant", "day", "sky"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-wordsworth-west",
  ...wordsworthSource,
  title: "Stepping Westward",
  body: verseBlock(wordsworth, `_"What you are stepping westward?"--"Yea_."`, (line) => line.startsWith("4.")),
  see: ["evening", "sky", "scenery", "person"],
});
add({
  id: "fixed-blake-sunflower",
  ...blakeSource,
  title: "Ah! Sunflower",
  body: blakePoem(blake, "AH, SUNFLOWER"),
  see: ["plant", "day", "light"],
});
add({
  id: "fixed-sonnet-65",
  ...shakespeare,
  title: "Sonnet 65",
  body: sonnet(sonnets, "LXV"),
  see: ["water", "plant", "day"],
});
add({
  id: "free-yagi-hikari",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "光",
  body: pick(yagiPoems, "光"),
  see: ["light", "person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-bocho-kuregata",
  ...bochoSource,
  title: "くれがた",
  body: pick(bochoPoems, "くれがた"),
  see: ["evening", "indoor", "plant"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lowell-london",
  ...lowellSource,
  title: "A London Thoroughfare. 2 A.M.",
  body: titledVerse(lowell, "A London Thoroughfare.  2 A.M."),
  see: ["street", "night", "water", "light"],
  say: ["short_line"],
});
add({
  id: "free-stevens-emperor",
  ...stevensSource,
  title: "The Emperor of Ice-Cream",
  body: titledVerse(stevens, "The Emperor of Ice-Cream"),
  see: ["indoor", "food", "person", "light"],
  say: ["one_leap", "stops"],
});
add({
  id: "free-yagi-kawa",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "ふるさとの川",
  body: pick(yagiPoems, "ふるさとの川"),
  see: ["water", "scenery"],
  say: ["short_line", "stops"],
});
add({
  id: "free-bocho-inori",
  ...bochoSource,
  title: "いのり",
  body: pick(bochoPoems, "いのり"),
  see: ["sky", "object"],
  say: ["short_line", "names_feeling", "one_leap"],
});
add({
  id: "free-hagiwara-kuki",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "草の茎",
  body: pick(hagiwara, "草の茎"),
  see: ["plant", "sky", "day"],
  say: ["short_line", "stops"],
});
add({
  id: "free-kenji-iwate",
  ...kenjiSource,
  title: "岩手山",
  body: pick(kenjiPoems, "岩手山"),
  see: ["sky", "light"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-whitman-glimpse",
  ...whitmanSource,
  title: "A Glimpse",
  body: gutenbergSlice(whitman, "A Glimpse", /\n\n\n/),
  see: ["indoor", "night", "person"],
  say: ["stops"],
});
add({
  id: "free-whitman-leaf",
  ...whitmanSource,
  title: "A Leaf for Hand in Hand",
  body: gutenbergSlice(whitman, "A Leaf for Hand in Hand", /\n\n\n/),
  see: ["water", "person", "street"],
  say: ["one_leap"],
});
const lastEpitaph = (text, name) => {
  const lines = text.split(/\r?\n/);
  let index = -1;
  lines.forEach((line, i) => {
    if (line.trim() === name) index = i;
  });
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
add({
  id: "free-masters-petit",
  ...mastersSource,
  title: "Petit, the Poet",
  body: lastEpitaph(masters, "Petit, the Poet"),
  see: ["plant", "scenery"],
  say: ["explains", "one_leap"],
});
add({
  id: "free-lawrence-bat",
  ...lawrenceSource,
  title: "Bat",
  body: titledVerse(lawrence, "BAT"),
  see: ["evening", "sky"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "haiku-shiki-nishibi",
  ...kanzanSource,
  body: kanzanLine(kanzan, "西日さす地藏の笠に蜻蛉哉"),
  see: ["day", "light", "object"],
});
add({
  id: "haiku-shiki-sumire",
  ...kanzanSource,
  body: kanzanLine(kanzan, "我庭に一本さきしすみれ哉"),
  see: ["plant"],
});
add({
  id: "haiku-shiki-kumo",
  ...kanzanSource,
  body: kanzanLine(kanzan, "春の月一重の雲にかくれけり"),
  see: ["sky", "evening"],
});
add({
  id: "haiku-shiki-tsubaki",
  ...kanzanSource,
  body: kanzanLine(kanzan, "落したか落ちたか路の椿かな"),
  see: ["plant", "street"],
});
add({
  id: "tanka-bokusui-sabi",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "自がこころ寂び古びなば"),
  see: ["person"],
  say: ["short_line", "stops", "names_feeling"],
});
add({
  id: "tanka-bokusui-hiji",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "書きながら肱をちぢめし"),
  see: ["person"],
});
add({
  id: "tanka-akiko-tobari",
  ...akikoSource,
  body: tankaLine(midare, "夜の帳にささめき尽きし"),
  see: ["night", "person", "light"],
});
add({
  id: "tanka-mokichi-umidori",
  ...mokichiSource,
  body: tankaLine(tsuyu, "灰いろの海鳥むれし"),
  see: ["morning", "light", "scenery"],
});
add({
  id: "fixed-toson-choon",
  ...tosonSource,
  title: "潮音",
  body: betweenTitles(wakanaText, "潮音", "酔歌"),
  see: ["water", "scenery"],
});
add({
  id: "fixed-toson-sode",
  ...tosonSource,
  title: "四つの袖",
  body: betweenTitles(wakanaText, "四つの袖", "天馬"),
  see: ["person"],
});
add({
  id: "fixed-susukida-ichijiku",
  ...susukidaSource,
  title: "無花果",
  body: pick(hakuyoPoems, "無花果"),
  see: ["plant", "day"],
});
add({
  id: "fixed-ariake-toki",
  ...ariakeSource,
  title: "束の間なりき",
  body: pick(shunchoPoems, "束の間なりき"),
  see: ["light", "person", "night"],
});
add({
  id: "fixed-keats-robin",
  ...keatsSource,
  title: "Robin Hood",
  body: verseBlock(keats, "No! those days are gone away,", (line) => line === "TO AUTUMN."),
  see: ["plant", "person"],
});
add({
  id: "fixed-keats-fancy",
  ...keatsSource,
  title: "Fancy",
  body: verseBlock(keats, "Ever let the Fancy roam,", (line) => line === "ODE." || line.startsWith("LINES ON THE MERMAID")),
  see: ["night", "indoor", "sky"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-wordsworth-sparrow",
  ...wordsworthSource,
  title: "The Sparrow's Nest",
  body: verseBlock(wordsworth, "Look, five blue eggs are gleaming there!", (line) => line.startsWith("10.")),
  see: ["person", "scenery"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "fixed-wordsworth-celandine",
  ...wordsworthSource,
  title: "The Small Celandine",
  body: verseBlock(wordsworth, "There is a Flower, the Lesser Celandine,", (line) => /^[789]\./.test(line)),
  see: ["plant", "day", "light"],
});
add({
  id: "free-chuya-dokugo",
  ...chuyaSource,
  title: "独語",
  body: pick(chuyaPoems, "独語"),
  see: ["water", "object"],
  say: ["short_line", "one_leap", "stops"],
});
add({
  id: "free-chuya-inori",
  ...chuyaSource,
  title: "祈り",
  body: pick(chuyaPoems, "祈り"),
  see: ["person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-senge-fuyu",
  ...sengeSource,
  title: "冬の日の入り",
  body: pick(sengePoems, "冬の日の入り"),
  see: ["evening", "light", "person"],
  say: ["short_line"],
});
add({
  id: "free-senge-kitakaze",
  ...sengeSource,
  title: "北風",
  body: pick(sengePoems, "北風"),
  see: ["evening", "sky"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-lowell-bungler",
  ...lowellSource,
  title: "The Bungler",
  body: titledVerse(lowell, "The Bungler"),
  see: ["light", "indoor"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lowell-obligation",
  ...lowellSource,
  title: "Obligation",
  body: titledVerse(lowell, "Obligation"),
  see: ["person"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-stevens-motion",
  ...stevensSource,
  title: "Life Is Motion",
  body: titledVerse(stevens, "Life Is Motion"),
  see: ["person", "scenery"],
  say: ["short_line"],
});
add({
  id: "free-stevens-wind",
  ...stevensSource,
  title: "To the Roaring Wind",
  body: titledVerse(stevens, "To the Roaring Wind"),
  see: ["night", "sky"],
  say: ["short_line", "one_leap"],
});
add({
  id: "haiku-shiki-tori",
  ...kanzanSource,
  body: kanzanLine(kanzan, "ちる花にもつるゝ鳥の翼かな"),
  see: ["plant"],
});
add({
  id: "haiku-shiki-ayu",
  ...kanzanSource,
  body: kanzanLine(kanzan, "見ればたゞ水の色なる小鮎哉"),
  see: ["water"],
});
add({
  id: "haiku-shiki-kabashira",
  ...kanzanSource,
  body: kanzanLine(kanzan, "夕立の來て蚊柱を崩しけり"),
  see: ["water", "day"],
});
add({
  id: "haiku-shiki-shoji",
  ...kanzanSource,
  body: kanzanLine(kanzan, "青／＼と障子にうつるはせを哉"),
  see: ["plant", "indoor", "light"],
});
add({
  id: "tanka-bokusui-issatsu",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "書くとなく書きてたまりし"),
  see: ["ordinary", "person"],
});
add({
  id: "tanka-bokusui-tanomare",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "おほくこれたのまれて書きし"),
  see: ["person"],
  say: ["short_line", "stops", "names_feeling"],
});
add({
  id: "tanka-takuboku-sunayama",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("砂山の砂に腹這ひ")),
  see: ["scenery", "person"],
});
add({
  id: "tanka-takuboku-ko",
  ...takubokuSource,
  body: tanka.find((block) => block.includes("目さまして猶起き出でぬ")),
  see: ["person", "morning"],
});
add({
  id: "fixed-toson-myojo",
  ...tosonSource,
  title: "明星",
  body: betweenTitles(wakanaText, "明星", "潮音"),
  see: ["morning", "light", "sky", "water"],
});
add({
  id: "fixed-ariake-keibaku",
  ...ariakeSource,
  title: "繋縛",
  body: pick(shunchoPoems, "繋縛"),
  see: ["person", "night", "light"],
});
add({
  id: "fixed-susukida-kuchizuke",
  ...susukidaSource,
  title: "くちづけ",
  body: pick(hakuyoPoems, "くちづけ"),
  see: ["morning", "water", "sky"],
});
add({
  id: "fixed-bansui-ichieda",
  ...bansuiSource,
  title: "花一枝",
  body: pick(tenchiPoems, "花一枝"),
  see: ["plant", "person"],
});
add({
  id: "fixed-blake-pipe",
  ...blakeSource,
  title: "Introduction",
  body: blakePoem(blake, "INTRODUCTION"),
  see: ["person", "day"],
});
add({
  id: "fixed-blake-clod",
  ...blakeSource,
  title: "The Clod and the Pebble",
  body: blakePoem(blake, "THE CLOD AND THE PEBBLE"),
  see: ["water"],
  say: ["rhyme", "short_line", "names_feeling"],
});
add({
  id: "fixed-keats-bards",
  ...keatsSource,
  title: "Bards of Passion and of Mirth",
  body: verseBlock(keats, "Bards of Passion and of Mirth,", (line) => line === "LINES"),
  see: ["person", "sky"],
});
add({
  id: "fixed-wordsworth-butterfly",
  ...wordsworthSource,
  title: "To a Butterfly",
  body: verseBlock(wordsworth, "Stay near me--do not take thy flight!", (line) => line.startsWith("2.")),
  see: ["person"],
  say: ["rhyme", "names_feeling"],
});
add({
  id: "free-oote-karasu",
  ...ooteSource,
  title: "陶器の鴉",
  body: betweenTitles(ooteText, "陶器の鴉", "しなびた船"),
  see: ["object", "day"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-oote-inu",
  ...ooteSource,
  title: "つんぼの犬",
  body: betweenTitles(ooteText, "つんぼの犬", "野の羊へ"),
  see: ["plant", "water"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-yagi-kaze",
  ...yagiSource,
  form: "free",
  lang: "ja",
  title: "風が鳴る",
  body: pick(yagiPoems, "風が鳴る"),
  see: ["plant"],
  say: ["short_line", "names_feeling"],
});
add({
  id: "free-hagiwara-nae",
  ...hagiwaraSource,
  form: "free",
  lang: "ja",
  title: "苗",
  body: pick(hagiwara, "苗"),
  see: ["plant", "sky", "light", "person"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lawrence-peach",
  ...lawrenceSource,
  title: "Peach",
  body: titledVerse(lawrence, "PEACH"),
  see: ["food"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-lawrence-jay",
  ...lawrenceSource,
  title: "The Blue Jay",
  body: titledVerse(lawrence, "THE BLUE JAY"),
  see: ["sky", "scenery"],
  say: ["short_line", "one_leap"],
});
add({
  id: "free-masters-hoheimer",
  ...mastersSource,
  title: "Knowlt Hoheimer",
  body: lastEpitaph(masters, "Knowlt Hoheimer"),
  see: ["person"],
  say: ["explains", "names_feeling"],
});
add({
  id: "free-masters-griffy",
  ...mastersSource,
  title: "Griffy the Cooper",
  body: lastEpitaph(masters, "Griffy the Cooper"),
  see: ["object", "person"],
  say: ["explains", "one_leap"],
});
add({
  id: "haiku-shiki-kiku",
  ...kanzanSource,
  body: kanzanLine(kanzan, "それ／＼に名のつく菊の芽生哉"),
  see: ["plant"],
});
add({
  id: "haiku-shiki-medaka",
  ...kanzanSource,
  body: kanzanLine(kanzan, "一ひらの花にあつまる目高哉"),
  see: ["plant", "water"],
});
add({
  id: "haiku-shiki-zuda",
  ...kanzanSource,
  body: kanzanLine(kanzan, "木の枝に頭陀かけてそこに晝寐哉"),
  see: ["plant", "day", "person"],
});
add({
  id: "haiku-shiki-okami",
  ...kanzanSource,
  body: kanzanLine(kanzan, "狼の聲も聞こゆる夜寒かな"),
  see: ["night"],
});
add({
  id: "tanka-bokusui-magokoro",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "眞心のこもらぬにあらず"),
  see: ["person"],
  say: ["short_line", "stops", "names_feeling"],
});
add({
  id: "tanka-bokusui-kakioki",
  ...bokusuiSource,
  body: tankaLine(bokusuiUta, "書きおきしは書かざりしに"),
  see: ["ordinary", "person"],
});
add({
  id: "tanka-akiko-kane",
  ...akikoSource,
  body: tankaLine(midare, "堂の鐘のひくきゆふべを"),
  see: ["evening", "person", "plant"],
});
add({
  id: "tanka-mokichi-nagasaki",
  ...mokichiSource,
  body: tankaLine(tsuyu, "とほく来てひとり寂しむに"),
  see: ["scenery", "person", "day"],
  say: ["short_line", "stops", "names_feeling"],
});
add({
  id: "fixed-toson-suika",
  ...tosonSource,
  title: "酔歌",
  body: betweenTitles(wakanaText, "酔歌", "二つの声"),
  see: ["person", "food"],
});
add({
  id: "fixed-susukida-kibou",
  ...susukidaSource,
  title: "希望",
  body: pick(hakuyoPoems, "希望"),
  see: ["water", "plant", "day"],
});
add({
  id: "fixed-ariake-aki",
  ...ariakeSource,
  title: "秋",
  body: pick(shunchoPoems, "秋"),
  see: ["evening", "water", "plant", "light"],
});
add({
  id: "fixed-bansui-airaku",
  ...bansuiSource,
  title: "哀樂",
  body: pick(tenchiPoems, "哀樂"),
  see: ["night", "sky", "light", "person"],
  say: ["shichigo", "names_feeling"],
});
add({
  id: "fixed-blake-boy",
  ...blakeSource,
  title: "The Little Boy Lost",
  body: blakePoem(blake, "THE LITTLE BOY LOST"),
  see: ["night", "person"],
});
add({
  id: "fixed-blake-rosetree",
  ...blakeSource,
  title: "My Pretty Rose Tree",
  body: verseBlock(blake, "A flower was offered to me,", (line) => line.startsWith("AH, SUNFLOWER")),
  see: ["plant"],
});
add({
  id: "fixed-wordsworth-gipsies",
  ...wordsworthSource,
  title: "Gipsies",
  body: verseBlock(wordsworth, "Yet are they here?--the same unbroken knot", (line) => line.startsWith("11.")),
  see: ["person", "night", "sky"],
});
add({
  id: "fixed-sonnet-94",
  ...shakespeare,
  title: "Sonnet 94",
  body: sonnet(sonnets, "XCIV"),
  see: ["plant", "person"],
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
