import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const search = request.nextUrl.search;
  const response = await apiFetch(`/v1/calls/${callSid}/events${search}`);
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
