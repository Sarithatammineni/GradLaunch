import type { Context, Next } from "hono";
import { config } from "./config";
import { getSessionUser, sessionFromCookieHeader, type SessionUser } from "./lib/auth";
import { db } from "./lib/db";
import { ACTIVITY } from "./lib/db";

export function cors() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("Origin") ?? "";
    if (origin && config.corsOrigins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Headers", "Content-Type");
      c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  };
}

export async function readJson<T = any>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}

export interface ApiCtx {
  user: SessionUser;
}

export async function getAuth(c: Context): Promise<SessionUser | null> {
  const sid = sessionFromCookieHeader(c.req.header("Cookie") ?? null);
  return getSessionUser(sid);
}

export async function requireAuth(c: Context): Promise<SessionUser | Response> {
  const user = await getAuth(c);
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return user;
}

export async function requireAdmin(c: Context): Promise<SessionUser | Response> {
  const user = await getAuth(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (!user.is_admin) return c.json({ error: "Admin access required" }, 403);
  return user;
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}

export async function logActivity(
  userId: number,
  kind: keyof typeof ACTIVITY | string,
  message: string,
  applicationId?: number
): Promise<void> {
  await db().execute({
    sql: "INSERT INTO activity_log (user_id, kind, message, application_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [userId, kind, message, applicationId ?? null, new Date().toISOString()]
  });
}

export async function notify(
  userId: number,
  message: string,
  kind: "info" | "warning" = "info",
  applicationId?: number
): Promise<void> {
  await db().execute({
    sql: "INSERT INTO notifications (user_id, message, kind, application_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [userId, message, kind, applicationId ?? null, new Date().toISOString()]
  });
}
