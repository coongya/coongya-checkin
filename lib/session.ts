import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "kungya_session";
const GROUP_COOKIE = "kungya_group"; // 현재 보고 있는 그룹

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  // 프로덕션에서 시크릿 없이 배포되면 세션 위조가 가능해지므로 기동을 막는다
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET 환경변수가 설정되지 않았어요. 배포 환경에 반드시 추가하세요.");
  }
  return "dev-secret-please-change";
}

export interface Session {
  userId: string;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof s.userId === "string") return { userId: s.userId };
    return null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(COOKIE)?.value);
}

export async function setSession(s: Session) {
  const store = await cookies();
  store.set(COOKIE, encodeSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
  store.delete(GROUP_COOKIE);
}

// 현재 선택된 그룹 (계정은 여러 그룹에 참여할 수 있음)
export async function getCurrentGroupId(): Promise<string | null> {
  const store = await cookies();
  return store.get(GROUP_COOKIE)?.value ?? null;
}

export async function clearCurrentGroupId() {
  const store = await cookies();
  store.delete(GROUP_COOKIE);
}

export async function setCurrentGroupId(groupId: string) {
  const store = await cookies();
  store.set(GROUP_COOKIE, groupId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

// PIN 해싱 (scrypt + salt)
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
