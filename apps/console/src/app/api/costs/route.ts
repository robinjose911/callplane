import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function GET() {
  const response = await apiFetch("/v1/costs");
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
