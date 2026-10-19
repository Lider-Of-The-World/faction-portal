import assert from "node:assert/strict";
import test from "node:test";
import {
  getMoscowDailyCycle,
  isDailyStandardPosition,
} from "./daily-standard-cycle.ts";

test("Moscow daily cycle changes at 23:59 Europe/Moscow", () => {
  const beforeRollover = getMoscowDailyCycle(
    new Date("2026-10-17T20:58:59.000Z"),
  );
  assert.equal(beforeRollover.dayKey, "2026-10-17");
  assert.equal(beforeRollover.startsAt.toISOString(), "2026-10-16T20:59:00.000Z");
  assert.equal(beforeRollover.endsAt.toISOString(), "2026-10-17T20:59:00.000Z");

  const atRollover = getMoscowDailyCycle(new Date("2026-10-17T20:59:00.000Z"));
  assert.equal(atRollover.dayKey, "2026-10-18");
  assert.equal(atRollover.startsAt.toISOString(), "2026-10-17T20:59:00.000Z");
  assert.equal(atRollover.endsAt.toISOString(), "2026-10-18T20:59:00.000Z");

  const afterMidnight = getMoscowDailyCycle(new Date("2026-10-17T21:00:00.000Z"));
  assert.equal(afterMidnight.dayKey, "2026-10-18");
  assert.equal(afterMidnight.startsAt.toISOString(), "2026-10-17T20:59:00.000Z");
});

test("a standard saved during the Moscow day is due at 23:59", () => {
  const cycle = getMoscowDailyCycle(new Date("2026-10-17T12:34:00.000Z"));

  assert.equal(cycle.dayKey, "2026-10-17");
  assert.equal(cycle.endsAt.toISOString(), "2026-10-17T20:59:00.000Z");
});

test("daily assignments recognize each of the six supported titles", () => {
  assert.equal(isDailyStandardPosition("Администратор"), true);
  assert.equal(isDailyStandardPosition("Лидер"), true);
  assert.equal(isDailyStandardPosition("Вице-Губернатор"), true);
  assert.equal(isDailyStandardPosition("депутат"), true);
  assert.equal(isDailyStandardPosition("Адвокат"), true);
  assert.equal(isDailyStandardPosition("Лицензёр"), true);
  assert.equal(isDailyStandardPosition("Сотрудник"), false);
  assert.equal(isDailyStandardPosition("Заместитель губернатора"), false);
});
