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

export const dailyOrderLimit = (raw: string | undefined) => {
  if (raw === undefined || raw.trim() === "") return 1;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 1;
};

export const orderAllowed = (hasRow: boolean, limit: number) => limit === 0 || !hasRow;

export const deliveryOf = (input: { now: Date; timeZone: string; localDate: string }) => {
  const here = localParts(input.now, input.timeZone);
  if (input.localDate !== here.date) return null;
  return { localDate: input.localDate, deliverAt: input.now.toISOString() };
};
