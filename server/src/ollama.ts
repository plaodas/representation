const base = () => (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");

const model = () => process.env.OLLAMA_MODEL || "qwen3.5:9b";

const headers = () => {
  const next: Record<string, string> = { "content-type": "application/json" };
  if (process.env.OLLAMA_SECRET) next.authorization = `Bearer ${process.env.OLLAMA_SECRET}`;
  return next;
};

export const ensureModel = async () => {
  const name = model();
  const shown = await fetch(`${base()}/api/show`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: name, name }),
  });
  if (shown.ok) return;
  const pulled = await fetch(`${base()}/api/pull`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: name, name, stream: false }),
  });
  if (!pulled.ok) throw new Error(await pulled.text());
};

export const writePoem = async (prompt: string) => {
  const name = model();
  const payload = {
    model: name,
    prompt,
    stream: false,
    think: false,
    options: { temperature: 0.8, num_predict: 320 },
  };
  let response = await fetch(`${base()}/api/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (response.status === 400) {
    const { think: _think, ...rest } = payload;
    response = await fetch(`${base()}/api/generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(rest),
    });
  }
  if (!response.ok) throw new Error(`ollama ${response.status}`);
  const json = (await response.json()) as { response?: string };
  return json.response ?? "";
};
