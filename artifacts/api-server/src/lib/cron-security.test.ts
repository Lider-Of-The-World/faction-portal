import assert from "node:assert/strict";
import test from "node:test";
import {
  allowCronRequestFromIp,
  constantTimeSecretMatch,
} from "./cron-security.ts";

test("cron secret comparison rejects missing, short, and mismatched values", () => {
  const secret = "a".repeat(40);
  assert.equal(constantTimeSecretMatch(secret, secret), true);
  assert.equal(constantTimeSecretMatch(secret), false);
  assert.equal(constantTimeSecretMatch(secret, "short"), false);
  assert.equal(constantTimeSecretMatch(secret, `${secret}x`), false);
});

test("cron IP rate limit allows twelve requests per minute, then resets", () => {
  const ip = "test-cron-ip";
  const start = 10_000;
  for (let i = 0; i < 12; i += 1) {
    assert.equal(allowCronRequestFromIp(ip, start + i), true);
  }
  assert.equal(allowCronRequestFromIp(ip, start + 20), false);
  assert.equal(allowCronRequestFromIp(ip, start + 60_001), true);
});
