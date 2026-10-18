import assert from "node:assert/strict";
import test from "node:test";
import { isDateWithinInactivityPeriod } from "./inactivity-period.ts";

test("an approved inactivity period includes both calendar dates", () => {
  const period = { startDate: "2026-10-20", endDate: "2026-10-25" };

  assert.equal(isDateWithinInactivityPeriod("2026-10-19", period), false);
  assert.equal(isDateWithinInactivityPeriod("2026-10-20", period), true);
  assert.equal(isDateWithinInactivityPeriod("2026-10-22", period), true);
  assert.equal(isDateWithinInactivityPeriod("2026-10-25", period), true);
  assert.equal(isDateWithinInactivityPeriod("2026-10-26", period), false);
});
