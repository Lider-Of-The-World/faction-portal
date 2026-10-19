import { getMoscowDailyCycle } from "./daily-standard-cycle.ts";

export type InactivityDatePeriod = {
  startDate: string;
  endDate: string;
};

export function isDateWithinInactivityPeriod(
  date: string,
  period: InactivityDatePeriod,
): boolean {
  return period.startDate <= date && date <= period.endDate;
}

export function getInactivityDailyCycleDueAtRange(period: InactivityDatePeriod): {
  firstDueAt: Date;
  lastDueAt: Date;
} {
  const firstCycle = getMoscowDailyCycle(
    new Date(`${period.startDate}T12:00:00.000Z`),
  );
  const lastCycle = getMoscowDailyCycle(
    new Date(`${period.endDate}T12:00:00.000Z`),
  );

  return { firstDueAt: firstCycle.endsAt, lastDueAt: lastCycle.endsAt };
}
