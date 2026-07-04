/**
 * Server-side fetch helper for calling the callplane API. Only ever called from Server
 * Components / Route Handlers — the API key never reaches the browser (no CORS, no
 * client-visible key), matching this repo's NVA-derived server-side-fetch pattern.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = process.env["API_BASE_URL"] ?? "http://localhost:4300";
  const apiKey = process.env["CALLPLANE_API_KEY"] ?? "";

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${apiKey}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}
