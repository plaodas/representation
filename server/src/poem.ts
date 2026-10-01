export const acceptPoem = (raw: string): string | null => {
  const fenced = raw.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/);
  const source = (fenced?.[1] ?? raw).replace(/<think>[\s\S]*?<\/think>/g, "");
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 6 || lines.length > 12) return null;
  if (lines.some((line) => /^[-*•・]/.test(line) || /^\d+[.)．、]/.test(line))) return null;
  return lines.join("\n");
};

const compact = (text: string) => text.replace(/\s/g, "");

const grams = (text: string) => {
  const source = compact(text);
  const out = new Set<string>();
  for (let index = 0; index <= source.length - 3; index += 1) out.add(source.slice(index, index + 3));
  return out;
};

export const tooClose = (poem: string, sample: string | null | undefined) => {
  const source = sample?.trim();
  if (!source) return false;
  const flat = compact(poem);
  const copied = source
    .split(/\r?\n/)
    .map((line) => compact(line))
    .filter((line) => line.length >= 4)
    .some((line) => flat.includes(line));
  if (copied) return true;
  const from = grams(source);
  if (from.size < 8) return false;
  const into = grams(poem);
  let hit = 0;
  for (const gram of from) if (into.has(gram)) hit += 1;
  return hit / from.size >= 0.55;
};
