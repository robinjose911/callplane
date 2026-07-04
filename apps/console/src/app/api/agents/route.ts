import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

/** Thin server-side proxy — keeps CALLPLANE_API_KEY out of the browser entirely. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await apiFetch("/v1/agents", { method: "POST", body });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
