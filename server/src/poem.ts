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
