export const localParts = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: hour === 24 ? 0 : hour,
  };
};

const addDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

export const utcForLocal = (date: string, hour: number, timeZone: string) => {
  const [year, month, day] = date.split("-").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localParts(new Date(utc), timeZone);
    const [gotYear, gotMonth, gotDay] = parts.date.split("-").map(Number);
    const got = Date.UTC(gotYear, gotMonth - 1, gotDay, parts.hour, 0, 0);
    const want = Date.UTC(year, month - 1, day, hour, 0, 0);
    utc += want - got;
  }
  return new Date(utc).toISOString();
};

export const deliveryOf = (input: {
  now: Date;
  timeZone: string;
  localDate: string;
  immediate: boolean;
}) => {
  const here = localParts(input.now, input.timeZone);
  if (input.localDate !== here.date) return null;
  if (input.immediate) {
    return { localDate: input.localDate, deliverAt: input.now.toISOString() };
  }
  const localDate = here.hour < 15 ? input.localDate : addDay(input.localDate);
  return { localDate, deliverAt: utcForLocal(localDate, 18, input.timeZone) };
};

export const canReplace = (status: string, hour: number, immediate: boolean) =>
  status === "待つ" && (immediate || hour < 15);
