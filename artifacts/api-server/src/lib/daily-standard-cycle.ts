export const MOSCOW_TIME_ZONE = "Europe/Moscow";

const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAILY_STANDARD_POSITIONS = new Set([
  "вице-губернатор",
  "депутат",
  "адвокат",
  "лицензер",
]);

export function getMoscowDailyCycle(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const dayKey = `${values.year}-${values.month}-${values.day}`;
  const startsAt = new Date(
    Date.UTC(year, month - 1, day) - MOSCOW_UTC_OFFSET_MS,
  );

  return {
    dayKey,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function isDailyStandardPosition(rank: string): boolean {
  const normalized = rank
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return DAILY_STANDARD_POSITIONS.has(normalized);
}
