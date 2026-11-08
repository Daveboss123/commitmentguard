import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverConfig } from "@/lib/app/config";
import { ApiError } from "@/lib/http/errors";

export const SESSION_COOKIE = "cg_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface DemoSession {
  userId: string;
  householdId: string;
  issuedAt: number;
  expiresAt: number;
}

interface SessionPayload {
  sub: string;
  hh: string;
  iat: number;
  exp: number;
}

function sign(value: string): string {
  return createHmac("sha256", serverConfig.authSecret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function encodeSession(userId: string, householdId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    hh: householdId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function decodeSession(token: string | undefined): DemoSession | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeEqual(sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!payload.sub || !payload.hh) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return {
      userId: payload.sub,
      householdId: payload.hh,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DemoSession | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<DemoSession> {
  const session = await getSession();
  if (!session) {
    throw new ApiError("AUTH_REQUIRED", "Sign in to continue.");
  }
  return session;
}

export async function requirePageSession(): Promise<DemoSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function setSessionCookie(
  userId: string,
  householdId: string,
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(userId, householdId), sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}
