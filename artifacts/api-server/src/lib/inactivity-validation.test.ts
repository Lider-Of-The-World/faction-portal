import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInactivityRequestSchema,
  isValidDateOnly,
  reviewInactivityRequestSchema,
} from "./inactivity-validation.ts";

describe("inactivity request validation", () => {
  it("accepts real ISO calendar dates and trims the reason", () => {
    const result = createInactivityRequestSchema.parse({
      startDate: "2026-10-20",
      endDate: "2026-10-25",
      reason: "  Отпуск  ",
    });
    assert.equal(result.reason, "Отпуск");
  });

  it("rejects impossible dates and reversed periods", () => {
    assert.equal(isValidDateOnly("2026-02-30"), false);
    assert.equal(
      createInactivityRequestSchema.safeParse({
        startDate: "2026-10-25",
        endDate: "2026-10-20",
        reason: "Отпуск",
      }).success,
      false,
    );
  });

  it("rejects a reason that is too short", () => {
    assert.equal(
      createInactivityRequestSchema.safeParse({
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        reason: "  ",
      }).success,
      false,
    );
  });

  it("accepts review decisions and cancellation of an approved request", () => {
    assert.equal(reviewInactivityRequestSchema.safeParse({ status: "approved" }).success, true);
    assert.equal(reviewInactivityRequestSchema.safeParse({ status: "rejected" }).success, true);
    assert.equal(reviewInactivityRequestSchema.safeParse({ status: "cancelled" }).success, true);
    assert.equal(reviewInactivityRequestSchema.safeParse({ status: "pending_review" }).success, false);
  });
});
