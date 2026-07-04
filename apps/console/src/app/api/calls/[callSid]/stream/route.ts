import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const response = await apiFetch(`/v1/calls/${callSid}/stream`);

  if (!response.ok) {
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }

  // Passed through as-is — the browser's EventSource consumes this directly, so the proxy must
  // not buffer it into a single response the way the JSON routes do.
  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
