import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await apiFetch(`/v1/webhook-outbox/${id}/replay`, { method: "POST" });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
