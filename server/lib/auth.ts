import { db } from "./db";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function newSessionId(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: number): Promise<{ id: string; expiresAt: string }> {
  const id = newSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString();
  await db().execute({
    sql: "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [id, userId, now.toISOString(), expiresAt]
  });
  return { id, expiresAt };
}

export interface SessionUser {
  id: number;
  email: string;
  full_name: string;
  profile_completed: number;
  is_admin: number;
}

export async function getSessionUser(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const res = await db().execute({
    sql: `SELECT u.id, u.email, u.full_name, u.profile_completed, u.is_admin
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > ?`,
    args: [sessionId, new Date().toISOString()]
  });
  const row = res.rows[0] as unknown as SessionUser | undefined;
  return row ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db().execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
}

export const SESSION_COOKIE = "pt_session";

export function sessionCookieHeader(sessionId: string, expiresAt: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Derives the session id from a Request's Cookie header. */
export function sessionFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

/** Token store for password resets (hashes stored so tokens are single-use + non-enumerable). */
const resetTokens = new Map<string, { userId: number; expiresAt: number }>();

export function createResetToken(userId: number): string {
  const token = randomBytes(24).toString("hex");
  resetTokens.set(token, { userId, expiresAt: Date.now() + 3600_000 });
  return token;
}

export function consumeResetToken(token: string): number | null {
  const entry = resetTokens.get(token);
  if (!entry) return null;
  resetTokens.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}
