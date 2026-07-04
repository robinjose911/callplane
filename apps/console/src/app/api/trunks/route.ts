import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await apiFetch("/v1/trunks", { method: "POST", body });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
