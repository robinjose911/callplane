import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const response = await apiFetch(`/v1/webhook-outbox${search}`);
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
