export type StandardPointsOutcome = "approved" | "rejected" | "not_submitted";
export type StandardPointsSource = "standard_approved" | "standard_rejected" | "standard_not_submitted";

export function standardPointsDelta(outcome: StandardPointsOutcome): number {
  return outcome === "approved" ? 5 : -2;
}

export function standardPointsSource(outcome: StandardPointsOutcome): StandardPointsSource {
  return outcome === "approved"
    ? "standard_approved"
    : outcome === "rejected"
      ? "standard_rejected"
      : "standard_not_submitted";
}

export function standardPointsRequestKey(assignmentId: string, source: StandardPointsSource): string {
  return "standard:" + assignmentId + ":" + source;
}

export function pointsAwardDelta(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Количество начисляемых баллов должно быть положительным целым числом.");
  }
  return amount;
}

export function pointsDeductionDelta(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Количество списываемых баллов должно быть положительным целым числом.");
  }
  return -amount;
}
