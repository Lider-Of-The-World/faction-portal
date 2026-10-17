export const FACTION_RANKS = [
  "Администратор",
  "Лидер",
  "Вице-Губернатор",
  "Депутат",
  "Адвокат",
  "Лицензер",
] as const;

export type FactionRank = (typeof FACTION_RANKS)[number];
export type FactionAccessRole = "leader" | "admin" | "employee";

function normalizeRank(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const rankByNormalized = new Map(
  FACTION_RANKS.map((rank) => [normalizeRank(rank), rank]),
);

export function canonicalFactionRank(value: string): FactionRank | undefined {
  return rankByNormalized.get(normalizeRank(value));
}

export function accessRoleForRank(rank: string): FactionAccessRole {
  const canonicalRank = canonicalFactionRank(rank);
  if (canonicalRank === "Лидер") return "leader";
  if (canonicalRank === "Администратор") return "admin";
  return "employee";
}

export function titleForMember(role: string, rank: string): string {
  if (role === "leader") return "Лидер";
  if (role === "admin") return "Администратор";
  return rank;
}
