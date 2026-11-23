import { metadata } from "@/lib/oauth";
import { json, preflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";
export const GET = () => json(metadata());
export const OPTIONS = preflight;
