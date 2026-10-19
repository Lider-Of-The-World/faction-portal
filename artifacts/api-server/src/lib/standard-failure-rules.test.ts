import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStandardFailureReason,
  standardFailureRequestKey,
} from "./standard-failure-rules.ts";

test("standard failure request keys are stable and scoped to an assignment", () => {
  const firstId = "123e4567-e89b-12d3-a456-426614174000";
  const secondId = "123e4567-e89b-12d3-a456-426614174001";

  assert.equal(standardFailureRequestKey(firstId), standardFailureRequestKey(firstId));
  assert.notEqual(standardFailureRequestKey(firstId), standardFailureRequestKey(secondId));
});

test("standard failure reasons identify the norm and the failure", () => {
  assert.equal(
    formatStandardFailureReason("  Тест на скорость  ", "  отчёт отклонён  "),
    "Норматив «Тест на скорость»: отчёт отклонён",
  );
});
