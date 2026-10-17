export type DisciplineType = "warning" | "reprimand";

export type DisciplineCounts = {
  activeWarnings: number;
  activeReprimands: number;
};

export type DisciplineDecision =
  | {
      allowed: true;
      convertActiveWarnings: boolean;
      nextActiveWarnings: number;
      nextActiveReprimands: number;
      maxLevelReached: boolean;
      automaticDismissal: false;
    }
  | {
      allowed: false;
      code: "invalid_counts" | "warning_limit" | "reprimand_limit";
      automaticDismissal: false;
    };

export function planDisciplineIssue(
  counts: DisciplineCounts,
  type: DisciplineType,
): DisciplineDecision {
  if (
    !Number.isInteger(counts.activeWarnings) ||
    !Number.isInteger(counts.activeReprimands) ||
    counts.activeWarnings < 0 ||
    counts.activeWarnings > 2 ||
    counts.activeReprimands < 0 ||
    counts.activeReprimands > 3
  ) {
    return {
      allowed: false,
      code: "invalid_counts",
      automaticDismissal: false,
    };
  }

  if (type === "warning") {
    if (counts.activeWarnings >= 2) {
      return {
        allowed: false,
        code: "warning_limit",
        automaticDismissal: false,
      };
    }

    if (counts.activeWarnings === 1) {
      if (counts.activeReprimands >= 3) {
        return {
          allowed: false,
          code: "reprimand_limit",
          automaticDismissal: false,
        };
      }
      const nextActiveReprimands = counts.activeReprimands + 1;
      return {
        allowed: true,
        convertActiveWarnings: true,
        nextActiveWarnings: 0,
        nextActiveReprimands,
        maxLevelReached: nextActiveReprimands === 3,
        automaticDismissal: false,
      };
    }

    return {
      allowed: true,
      convertActiveWarnings: false,
      nextActiveWarnings: counts.activeWarnings + 1,
      nextActiveReprimands: counts.activeReprimands,
      maxLevelReached: false,
      automaticDismissal: false,
    };
  }

  if (counts.activeReprimands >= 3) {
    return {
      allowed: false,
      code: "reprimand_limit",
      automaticDismissal: false,
    };
  }

  const nextActiveReprimands = counts.activeReprimands + 1;
  return {
    allowed: true,
    convertActiveWarnings: false,
    nextActiveWarnings: counts.activeWarnings,
    nextActiveReprimands,
    maxLevelReached: nextActiveReprimands === 3,
    automaticDismissal: false,
  };
}
