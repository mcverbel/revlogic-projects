import { NextResponse } from "next/server";

// Connectors call these endpoints from their own servers; CORS is open so browser-based clients work too.
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version" };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

/** Token requests are normally form-encoded; accept JSON too. */
export async function formOrJson(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(b).filter(([, v]) => typeof v === "string") as [string, string][]);
  }
  return new URLSearchParams(await req.text());
}
