import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await request.text();
  const response = await apiFetch(`/v1/webhook-endpoints/${name}`, { method: "PATCH", body });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
