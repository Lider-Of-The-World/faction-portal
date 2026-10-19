export const MOSCOW_TIME_ZONE = "Europe/Moscow";

const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const MOSCOW_DAILY_ROLLOVER_MS = (23 * 60 + 59) * 60 * 1000;
const DAILY_CYCLE_MS = 24 * 60 * 60 * 1000;
const DAILY_STANDARD_POSITIONS = new Set([
  "администратор",
  "лидер",
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
  const todayBoundary = new Date(
    Date.UTC(year, month - 1, day) -
      MOSCOW_UTC_OFFSET_MS +
      MOSCOW_DAILY_ROLLOVER_MS,
  );
  const startsAt =
    now.getTime() >= todayBoundary.getTime()
      ? todayBoundary
      : new Date(todayBoundary.getTime() - DAILY_CYCLE_MS);
  const endsAt = new Date(startsAt.getTime() + DAILY_CYCLE_MS);
  const cycleDayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(endsAt.getTime() - 60 * 1000));
  const cycleDayValues = Object.fromEntries(
    cycleDayParts.map(({ type, value }) => [type, value]),
  );
  const dayKey = `${cycleDayValues.year}-${cycleDayValues.month}-${cycleDayValues.day}`;

  return {
    dayKey,
    startsAt,
    endsAt,
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

export function normalizeDailyStandardRank(rank: string): string {
  return rank
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
