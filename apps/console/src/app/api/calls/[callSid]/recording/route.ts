import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const response = await apiFetch(`/v1/calls/${callSid}/recording`);

  if (!response.ok) {
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "audio/wav" },
  });
}

// Existence check for the console's "does this call have a recording yet?" gate — Next.js route
// handlers don't fall back HEAD to GET the way Express does, so this needs its own export.
export async function HEAD(_request: NextRequest, { params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const response = await apiFetch(`/v1/calls/${callSid}/recording`, { method: "HEAD" });
  return new NextResponse(null, { status: response.ok ? 200 : 404 });
}
