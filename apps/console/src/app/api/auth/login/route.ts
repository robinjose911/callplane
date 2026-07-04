import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * POST /api/auth/login — validates static credentials from env vars
 * (CONSOLE_USER + CONSOLE_PASSWORD). On success, creates an iron-session cookie.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const { username, password } = body;

  const expectedUser = process.env["CONSOLE_USER"] ?? "admin";
  const expectedPassword = process.env["CONSOLE_PASSWORD"] ?? "";

  if (!expectedPassword || username !== expectedUser || password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.username = username;
  await session.save();

  return NextResponse.json({ success: true });
}
