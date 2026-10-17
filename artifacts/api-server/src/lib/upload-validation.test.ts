import assert from "node:assert/strict";
import test from "node:test";
import {
  validateDeclaredImage,
  verifyImageBytes,
} from "./uploadValidation.ts";

test("declared image validation accepts supported matching types under the limit", () => {
  assert.equal(validateDeclaredImage("screen.jpg", 3, "image/jpeg"), null);
  assert.equal(validateDeclaredImage("screen.png", 8, "image/png"), null);
  assert.equal(validateDeclaredImage("screen.webp", 12, "image/webp"), null);
});

test("declared image validation rejects mismatched extensions, types, and sizes", () => {
  assert.ok(validateDeclaredImage("screen.exe", 3, "image/jpeg"));
  assert.ok(validateDeclaredImage("screen.jpg", 3, "image/png"));
  assert.ok(validateDeclaredImage("screen.jpg", 0, "image/jpeg"));
  assert.ok(validateDeclaredImage("screen.jpg", 10 * 1024 * 1024 + 1, "image/jpeg"));
});

test("binary validation checks the declared size and image signature", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const upload = {
    originalName: "proof.jpg",
    size: jpeg.length,
    contentType: "image/jpeg",
  };
  const valid = verifyImageBytes(upload, jpeg);
  assert.ok("verified" in valid);
  if ("verified" in valid) {
    assert.equal(valid.verified.detectedContentType, "image/jpeg");
    assert.equal(valid.verified.actualSize, jpeg.length);
  }
  assert.ok("error" in verifyImageBytes(upload, Buffer.from([0x4d, 0x5a, 0x00, 0x00])));
  assert.ok("error" in verifyImageBytes(upload, Buffer.from([0xff, 0xd8, 0xff])));
});
