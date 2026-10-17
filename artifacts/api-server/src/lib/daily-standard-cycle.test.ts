import assert from "node:assert/strict";
import test from "node:test";
import {
  getMoscowDailyCycle,
  isDailyStandardPosition,
} from "./daily-standard-cycle.ts";

test("Moscow daily cycle changes at 00:00 Europe/Moscow", () => {
  const beforeMidnight = getMoscowDailyCycle(
    new Date("2026-10-17T20:59:59.000Z"),
  );
  assert.equal(beforeMidnight.dayKey, "2026-10-17");
  assert.equal(beforeMidnight.startsAt.toISOString(), "2026-10-16T21:00:00.000Z");
  assert.equal(beforeMidnight.endsAt.toISOString(), "2026-10-17T21:00:00.000Z");

  const atMidnight = getMoscowDailyCycle(new Date("2026-10-17T21:00:00.000Z"));
  assert.equal(atMidnight.dayKey, "2026-10-18");
  assert.equal(atMidnight.startsAt.toISOString(), "2026-10-17T21:00:00.000Z");
});

test("daily assignments target only the four requested positions", () => {
  assert.equal(isDailyStandardPosition("Вице-Губернатор"), true);
  assert.equal(isDailyStandardPosition("депутат"), true);
  assert.equal(isDailyStandardPosition("Адвокат"), true);
  assert.equal(isDailyStandardPosition("Лицензёр"), true);
  assert.equal(isDailyStandardPosition("Сотрудник"), false);
  assert.equal(isDailyStandardPosition("Заместитель губернатора"), false);
});
