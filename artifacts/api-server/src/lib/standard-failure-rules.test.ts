import assert from "node:assert/strict";
import test from "node:test";
import {
  createAutomaticStandardRejection,
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

test("an automatically missed standard is finalized as rejected", () => {
  const submittedAt = new Date("2026-10-20T20:59:00.000Z");
  const reason = "Норматив «Тест»: не сдан в срок.";

  assert.deepEqual(
    createAutomaticStandardRejection({
      version: 1,
      comment: "Сдача не отправлена; скриншотов нет.",
      reason,
      submittedAt,
    }),
    {
      version: 1,
      comment: "Сдача не отправлена; скриншотов нет.",
      status: "rejected",
      decisionReason: reason,
      submittedAt,
    },
  );
});
