import { type SessionOptions as IronSessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
}

export const sessionOptions: IronSessionOptions = {
  cookieName: "callplane_console_session",
  password: process.env["SESSION_SECRET"] ?? "fallback-dev-secret-please-change-in-production",
  cookieOptions: {
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 60 * 60 * 8, // 8 hours
    sameSite: "lax",
    httpOnly: true,
  },
};

/** Gets the iron-session for Server Components and Route Handlers. */
export async function getSession() {
  const cookieStore = await cookies();
  // Next's ReadonlyRequestCookies.set() is structurally compatible with iron-session's
  // (non-exported, so uncastable-to-by-name) CookieStore interface at runtime — the mismatch
  // exactOptionalPropertyTypes flags (an optional 3rd param typed `| undefined` vs. omittable)
  // is a type-level artifact only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  return getIronSession<SessionData>(cookieStore as any, sessionOptions);
}
