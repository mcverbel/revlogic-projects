import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runSuggestionsForAll } from "@/lib/suggest";
import { syncDealStages } from "@/lib/deal-sync";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stages = await syncDealStages();
  const results = await runSuggestionsForAll();
  return NextResponse.json({ stages, results });
}
