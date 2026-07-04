import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api-client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await request.text();
  const response = await apiFetch(`/v1/agents/${name}`, { method: "PATCH", body });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const response = await apiFetch(`/v1/agents/${name}`, { method: "DELETE" });
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
