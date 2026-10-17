import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { authSessionsTable, db, membersTable } from "@workspace/db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "faction_session";
const SESSION_TTL_DAYS = 7;

export type FactionRole = "leader" | "admin" | "employee";
export type FactionStatus = "active" | "blocked";

export interface AuthUser {
  id: string;
  nickname: string;
  role: FactionRole;
  rank: string;
  status: FactionStatus;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      factionUser?: AuthUser;
      factionSessionId?: string;
    }
  }
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, salt, expectedHex] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== 64) return false;
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", getSessionSecret()).update(token).digest("hex");
}

export function hashRateLimitKey(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

export async function issueSession(
  memberId: string,
  res: Response,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessionsTable).values({
    memberId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token || token.length > 128) {
    res.status(401).json({ error: "Требуется вход в аккаунт." });
    return;
  }

  const [record] = await db
    .select({
      sessionId: authSessionsTable.id,
      memberId: membersTable.id,
      nickname: membersTable.nickname,
      role: membersTable.role,
      rank: membersTable.rank,
      status: membersTable.status,
      mustChangePassword: membersTable.mustChangePassword,
    })
    .from(authSessionsTable)
    .innerJoin(membersTable, eq(authSessionsTable.memberId, membersTable.id))
    .where(
      and(
        eq(authSessionsTable.tokenHash, hashSessionToken(token)),
        gt(authSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record || record.status !== "active") {
    if (record) {
      await db
        .delete(authSessionsTable)
        .where(eq(authSessionsTable.id, record.sessionId));
    }
    clearSessionCookie(res);
    res.status(401).json({ error: "Сессия завершена. Войдите снова." });
    return;
  }

  req.factionUser = {
    id: record.memberId,
    nickname: record.nickname,
    role: record.role as FactionRole,
    rank: record.rank,
    status: record.status as FactionStatus,
    mustChangePassword: record.mustChangePassword,
  };
  req.factionSessionId = record.sessionId;
  next();
}

export async function requireReadyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, () => {
    if (req.factionUser?.mustChangePassword) {
      res.status(403).json({
        error: "Сначала смените временный пароль в настройках аккаунта.",
      });
      return;
    }
    next();
  });
}

export function requireManager(
  req: Request,
  res: Response,
): boolean {
  if (req.factionUser?.role === "leader" || req.factionUser?.role === "admin") {
    return true;
  }
  res.status(403).json({ error: "Недостаточно прав для этого действия." });
  return false;
}
