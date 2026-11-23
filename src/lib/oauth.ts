// Sign-in for AI connectors (ChatGPT, Claude) using OAuth 2.1 with PKCE and dynamic client registration,
// the flow both products use for custom MCP connectors. People sign in with their app account (Google),
// approve the connection, and every connector call then acts as them.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { oauthClients, oauthCodes, oauthTokens } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { sha256 } from "@/lib/crypto";

/** One line per sign-in step in the server logs (Vercel → Logs). Never includes codes, tokens or secrets. */
export function oauthLog(step: string, detail: Record<string, unknown> = {}) {
  console.log(`[oauth] ${step} ${JSON.stringify(detail)}`);
}

export const ACCESS_TTL_S = 3600; // 1 hour
const REFRESH_TTL_MS = 90 * 86_400_000; // 90 days, renewed on every refresh
const CODE_TTL_MS = 10 * 60_000;

/**
 * Only these sites can receive a sign-in. It stops a look-alike "app" from asking a teammate to connect
 * and capturing their access. Add hosts with OAUTH_REDIRECT_HOSTS (comma separated) if needed.
 */
const DEFAULT_HOSTS = ["chatgpt.com", "chat.openai.com", "openai.com", "claude.ai", "claude.com"];
export function redirectAllowed(uri: string) {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return process.env.NODE_ENV !== "production" || !!process.env.OAUTH_ALLOW_LOCALHOST;
  if (u.protocol !== "https:") return false;
  const hosts = [...DEFAULT_HOSTS, ...(process.env.OAUTH_REDIRECT_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)];
  const h = u.hostname.toLowerCase();
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
}

/** Friendly name for the consent screen, from where the sign-in goes back to. */
export function productName(uri: string) {
  const h = (() => { try { return new URL(uri).hostname; } catch { return ""; } })();
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(h)) return "ChatGPT";
  if (/(^|\.)(claude\.ai|claude\.com)$/.test(h)) return "Claude";
  return h || "An app";
}

export function metadata() {
  const base = appUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["tasks"],
  };
}
export const resourceMetadata = () => ({
  resource: `${appUrl()}/api/mcp`,
  authorization_servers: [appUrl()],
  scopes_supported: ["tasks"],
  bearer_methods_supported: ["header"],
  resource_name: "revlogic Projects",
});

const OAUTH_SQL = `CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "auth_method" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "secret_hash" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_hash" text NOT NULL UNIQUE,
	"refresh_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;

/** Creates the sign-in tables if their migration hasn't been run on this database yet. */
let ensured = false;
export async function ensureOAuthTables() {
  if (ensured) return;
  // Same SQL as drizzle/0006_oauth.sql (kept inline so it ships with the serverless function).
  for (const stmt of OAUTH_SQL.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) await db.execute(sql.raw(stmt));
  ensured = true;
}

const b64url = (b: Buffer) => b.toString("base64url");
const secret = (prefix: string) => prefix + b64url(randomBytes(32));

const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

export async function registerClient(body: { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown }) {
  await ensureOAuthTables();
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length) return { error: "invalid_redirect_uri", error_description: "redirect_uris is required" } as const;
  const bad = uris.find((u) => !redirectAllowed(u));
  if (bad) return { error: "invalid_redirect_uri", error_description: `Redirects to ${bad} aren't allowed for revlogic Projects` } as const;
  // Public clients (PKCE only) or confidential ones with a secret: whichever the connector asks for.
  const asked = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!(AUTH_METHODS as readonly string[]).includes(asked)) return { error: "invalid_client_metadata", error_description: `token_endpoint_auth_method ${asked} isn't supported` } as const;
  const method = asked as AuthMethod;
  const id = "rlc_" + b64url(randomBytes(16));
  const clientSecret = method === "none" ? null : secret("rls_");
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : null;
  await db.insert(oauthClients).values({ id, name, redirectUris: uris.slice(0, 10), authMethod: method, secretHash: clientSecret ? sha256(clientSecret) : null });
  return {
    client_id: id, ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: name, redirect_uris: uris.slice(0, 10), token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

/** Checks the client's credentials at the token endpoint (body or Basic header). */
async function authenticateClient(p: URLSearchParams, basic: { id: string; secret: string } | null) {
  const clientId = basic?.id || p.get("client_id") || "";
  const client = clientId ? await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) }) : null;
  if (!client) return null;
  if (client.authMethod === "none") return client;
  const given = basic?.secret || p.get("client_secret") || "";
  return given && client.secretHash === sha256(given) ? client : null;
}

export async function findClient(clientId: string) {
  await ensureOAuthTables();
  return db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) });
}

export async function createCode(o: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string | null }) {
  await ensureOAuthTables();
  const code = secret("rla_");
  await db.insert(oauthCodes).values({ codeHash: sha256(code), ...o, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  return code;
}

async function issue(clientId: string, userId: string, scope: string | null) {
  const access = secret("rlo_");
  const refresh = secret("rlr_");
  await db.insert(oauthTokens).values({
    accessHash: sha256(access), refreshHash: sha256(refresh), clientId, userId,
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scope ?? "tasks" };
}

type TokenError = { error: string; error_description?: string };
export async function exchange(p: URLSearchParams, basic: { id: string; secret: string } | null = null): Promise<TokenError | Awaited<ReturnType<typeof issue>>> {
  await ensureOAuthTables();
  const grant = p.get("grant_type");
  const client = await authenticateClient(p, basic);
  if (!client) return { error: "invalid_client", error_description: "Unknown client or wrong client credentials" };
  const clientId = client.id;
  if (grant === "authorization_code") {
    const code = p.get("code") ?? "";
    const verifier = p.get("code_verifier") ?? "";
    // Mark the code used in the same statement that reads it, so it can only ever be exchanged once.
    const [row] = await db.update(oauthCodes).set({ usedAt: new Date() })
      .where(and(eq(oauthCodes.codeHash, sha256(code)), isNull(oauthCodes.usedAt), gt(oauthCodes.expiresAt, new Date()))).returning();
    if (!row) return { error: "invalid_grant", error_description: "Code is invalid, expired or already used" };
    if (clientId !== row.clientId) return { error: "invalid_grant", error_description: "Code was issued to another client" };
    if ((p.get("redirect_uri") ?? row.redirectUri) !== row.redirectUri) return { error: "invalid_grant", error_description: "redirect_uri doesn't match" };
    if (!verifier || b64url(createHash("sha256").update(verifier).digest()) !== row.codeChallenge) return { error: "invalid_grant", error_description: "PKCE check failed" };
    return issue(row.clientId, row.userId, row.scope);
  }
  if (grant === "refresh_token") {
    const refresh = p.get("refresh_token") ?? "";
    // Refresh tokens rotate: the old one stops working as soon as it's used.
    const found = await db.query.oauthTokens.findFirst({ where: and(eq(oauthTokens.refreshHash, sha256(refresh)), gt(oauthTokens.refreshExpiresAt, new Date())) });
    if (!found) return { error: "invalid_grant", error_description: "Refresh token is invalid or expired" };
    if (clientId !== found.clientId) return { error: "invalid_grant", error_description: "Refresh token was issued to another client" };
    const [row] = await db.delete(oauthTokens).where(eq(oauthTokens.id, found.id)).returning();
    if (!row) return { error: "invalid_grant", error_description: "Refresh token was already used" };
    return issue(row.clientId, row.userId, null);
  }
  return { error: "unsupported_grant_type" };
}

export async function revoke(token: string) {
  await ensureOAuthTables();
  const h = sha256(token);
  await db.delete(oauthTokens).where(sql`${oauthTokens.accessHash} = ${h} or ${oauthTokens.refreshHash} = ${h}`);
}

/** The person behind a connector's access token, or null. */
export async function userForAccessToken(token: string) {
  await ensureOAuthTables();
  const row = await db.query.oauthTokens.findFirst({ where: and(eq(oauthTokens.accessHash, sha256(token)), gt(oauthTokens.accessExpiresAt, new Date())) });
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.update(oauthTokens).set({ lastUsedAt: new Date() }).where(eq(oauthTokens.id, row.id));
  return row;
}

/** Connected apps for the Connections page, one row per sign-in. */
export async function connectedApps(userId: string) {
  await ensureOAuthTables();
  const rows = await db.select({ id: oauthTokens.id, lastUsedAt: oauthTokens.lastUsedAt, createdAt: oauthTokens.createdAt, refreshExpiresAt: oauthTokens.refreshExpiresAt, redirectUris: oauthClients.redirectUris, name: oauthClients.name })
    .from(oauthTokens).innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.clientId))
    .where(and(eq(oauthTokens.userId, userId), gt(oauthTokens.refreshExpiresAt, new Date())));
  return rows.map((r) => ({ id: r.id, product: productName(r.redirectUris[0] ?? ""), lastUsedAt: (r.lastUsedAt ?? r.createdAt).toISOString() }));
}

export async function disconnectApp(userId: string, id: string) {
  await ensureOAuthTables();
  await db.delete(oauthTokens).where(and(eq(oauthTokens.id, id), eq(oauthTokens.userId, userId)));
}
