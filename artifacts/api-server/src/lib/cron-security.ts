import { timingSafeEqual } from "node:crypto";

const ipWindow = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 12;

export function constantTimeSecretMatch(expected: string, supplied?: string): boolean {
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length < 32 || expectedBytes.length !== suppliedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

export function allowCronRequestFromIp(ip: string, now = Date.now()): boolean {
  if (ipWindow.size > 10_000) {
    for (const [key, entry] of ipWindow) {
      if (now - entry.startedAt >= WINDOW_MS) ipWindow.delete(key);
    }
  }

  const current = ipWindow.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    ipWindow.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_IP) return false;
  current.count += 1;
  return true;
}
