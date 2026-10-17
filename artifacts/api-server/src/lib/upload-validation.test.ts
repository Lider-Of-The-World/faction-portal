import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  SubmitStandardBody,
  SubmitTaskBody,
} from "../../../../lib/api-zod/src/generated/api.ts";
import {
  MAX_SCREENSHOT_BYTES,
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
  assert.equal(validateDeclaredImage("screen.jpg", MAX_SCREENSHOT_BYTES, "image/jpeg"), null);
  assert.ok(validateDeclaredImage("screen.jpg", MAX_SCREENSHOT_BYTES + 1, "image/jpeg"));
});

test("upload API accepts files up to 25 MiB, but not larger files", () => {
  const request = {
    name: "screen.jpg",
    contentType: "image/jpeg",
    size: MAX_SCREENSHOT_BYTES,
  };
  assert.equal(RequestUploadUrlBody.safeParse(request).success, true);
  assert.equal(
    RequestUploadUrlBody.safeParse({
      ...request,
      size: MAX_SCREENSHOT_BYTES + 1,
    }).success,
    false,
  );
});

test("upload URL response accepts Dropbox's same-origin route and absolute storage URLs", () => {
  const uploadId = "00000000-0000-4000-8000-000000000001";
  const base = { objectPath: `/objects/uploads/${uploadId}`, uploadId };
  assert.equal(
    RequestUploadUrlResponse.safeParse({
      ...base,
      uploadURL: `/api/storage/uploads/transfer/${uploadId}`,
    }).success,
    true,
  );
  assert.equal(
    RequestUploadUrlResponse.safeParse({
      ...base,
      uploadURL: "https://storage.example.com/signed-upload",
    }).success,
    true,
  );
  assert.equal(
    RequestUploadUrlResponse.safeParse({
      ...base,
      uploadURL: `/api/storage/other/${uploadId}`,
    }).success,
    false,
  );
});

test("standard and task submissions accept more than eight screenshots", () => {
  const uploadIds = Array.from(
    { length: 9 },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  assert.equal(
    SubmitStandardBody.safeParse({ comment: "Proof", uploadIds }).success,
    true,
  );
  assert.equal(
    SubmitTaskBody.safeParse({ comment: "Proof", uploadIds }).success,
    true,
  );
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
