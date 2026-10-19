import assert from "node:assert/strict";
import test from "node:test";
import {
  pointsDeductionDelta,
  standardPointsDelta,
  standardPointsRequestKey,
  standardPointsSource,
} from "./points-rules.ts";

test("approved standards award five points; rejected and missing standards deduct two", () => {
  assert.equal(standardPointsDelta("approved"), 5);
  assert.equal(standardPointsDelta("rejected"), -2);
  assert.equal(standardPointsDelta("not_submitted"), -2);
});

test("standard point request keys are stable and distinguish assignments and outcomes", () => {
  const assignmentId = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(standardPointsRequestKey(assignmentId, standardPointsSource("approved")), standardPointsRequestKey(assignmentId, standardPointsSource("approved")));
  assert.notEqual(standardPointsRequestKey(assignmentId, standardPointsSource("approved")), standardPointsRequestKey(assignmentId, standardPointsSource("rejected")));
  assert.notEqual(standardPointsRequestKey(assignmentId, standardPointsSource("approved")), standardPointsRequestKey("123e4567-e89b-12d3-a456-426614174001", standardPointsSource("approved")));
});

test("manual point deductions accept only positive safe integers", () => {
  assert.equal(pointsDeductionDelta(7), -7);
  assert.throws(() => pointsDeductionDelta(0));
  assert.throws(() => pointsDeductionDelta(-1));
  assert.throws(() => pointsDeductionDelta(1.5));
});
