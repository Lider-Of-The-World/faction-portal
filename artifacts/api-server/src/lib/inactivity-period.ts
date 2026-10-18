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
