import assert from "node:assert/strict";
import test from "node:test";
import { planDisciplineIssue } from "./discipline-rules.ts";

test("a second active warning converts both warnings into one reprimand", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 1, activeReprimands: 1 },
    "warning",
  );

  assert.deepEqual(decision, {
    allowed: true,
    convertActiveWarnings: true,
    nextActiveWarnings: 0,
    nextActiveReprimands: 2,
    maxLevelReached: false,
    automaticDismissal: false,
  });
});

test("a first warning remains active and does not create a reprimand", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 0, activeReprimands: 0 },
    "warning",
  );

  assert.equal(decision.allowed, true);
  if (!decision.allowed) return;
  assert.equal(decision.convertActiveWarnings, false);
  assert.equal(decision.nextActiveWarnings, 1);
  assert.equal(decision.nextActiveReprimands, 0);
});

test("the third reprimand reaches the maximum level without dismissal", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 0, activeReprimands: 2 },
    "reprimand",
  );

  assert.equal(decision.allowed, true);
  if (!decision.allowed) return;
  assert.equal(decision.nextActiveReprimands, 3);
  assert.equal(decision.maxLevelReached, true);
  assert.equal(decision.automaticDismissal, false);
});

test("a fourth active reprimand is rejected", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 0, activeReprimands: 3 },
    "reprimand",
  );

  assert.deepEqual(decision, {
    allowed: false,
    code: "reprimand_limit",
    automaticDismissal: false,
  });
});

test("a warning conversion cannot create a fourth reprimand", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 1, activeReprimands: 3 },
    "warning",
  );

  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.code, "reprimand_limit");
});

test("a warning at the existing maximum level does not repeat the threshold event", () => {
  const decision = planDisciplineIssue(
    { activeWarnings: 0, activeReprimands: 3 },
    "warning",
  );

  assert.equal(decision.allowed, true);
  if (!decision.allowed) return;
  assert.equal(decision.nextActiveWarnings, 1);
  assert.equal(decision.maxLevelReached, false);
  assert.equal(decision.automaticDismissal, false);
});

test("a third active warning and corrupt counts are rejected", () => {
  assert.equal(
    planDisciplineIssue(
      { activeWarnings: 2, activeReprimands: 0 },
      "warning",
    ).allowed,
    false,
  );
  assert.equal(
    planDisciplineIssue(
      { activeWarnings: 4, activeReprimands: 0 },
      "warning",
    ).allowed,
    false,
  );
});
