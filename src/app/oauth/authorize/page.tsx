import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCode, findClient, oauthLog, productName, redirectAllowed } from "@/lib/oauth";

type P = Record<string, string | undefined>;
const KEYS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

/** Checks the request; problems with the client or redirect are shown here, never sent to an unknown address. */
type Checked = { kind: "fatal"; message: string } | { kind: "back"; url: string } | { kind: "ok"; clientId: string; redirectUri: string };
async function check(p: P): Promise<Checked> {
  const client = p.client_id ? await findClient(p.client_id) : null;
  if (!client || !p.redirect_uri || !client.redirectUris.includes(p.redirect_uri) || !redirectAllowed(p.redirect_uri)) {
    oauthLog("authorize rejected", { client: p.client_id, known: !!client, redirect: p.redirect_uri, registered: client?.redirectUris });
    return { kind: "fatal", message: "This connection request isn't valid. Start the connection again from ChatGPT or Claude." };
  }
  const back = (error: string) => { const u = new URL(p.redirect_uri!); u.searchParams.set("error", error); if (p.state) u.searchParams.set("state", p.state); return u.toString(); };
  if (p.response_type !== "code" || !p.code_challenge || (p.code_challenge_method ?? "plain") !== "S256") oauthLog("authorize bad request", { client: p.client_id, response_type: p.response_type, pkce: p.code_challenge_method ?? null });
  if (p.response_type !== "code") return { kind: "back", url: back("unsupported_response_type") };
  if (!p.code_challenge || (p.code_challenge_method ?? "plain") !== "S256") return { kind: "back", url: back("invalid_request") };
  return { kind: "ok", clientId: client.id, redirectUri: p.redirect_uri };
}

export default async function Authorize({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => typeof v === "string") as [string, string][]);
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }
  const me = await db.query.users.findFirst({ where: eq(users.id, uid) });
  const c = await check(p);
  if (c.kind === "back") redirect(c.url);
  const product = c.kind === "ok" ? productName(c.redirectUri) : "";

  async function decide(form: FormData) {
    "use server";
    const q: P = Object.fromEntries(KEYS.map((k) => [k, (form.get(k) as string) || undefined]));
    const sid = (await auth())?.user?.id;
    if (!sid) redirect("/login");
    const v = await check(q);
    if (v.kind === "fatal") redirect("/");
    if (v.kind === "back") redirect(v.url);
    const u = new URL(v.redirectUri);
    if (form.get("decision") === "allow") {
      u.searchParams.set("code", await createCode({ clientId: v.clientId, userId: sid, redirectUri: v.redirectUri, codeChallenge: q.code_challenge!, scope: q.scope ?? null }));
      oauthLog("authorize allowed", { client: v.clientId, user: sid });
    } else { u.searchParams.set("error", "access_denied"); oauthLog("authorize denied", { client: v.clientId, user: sid }); }
    if (q.state) u.searchParams.set("state", q.state);
    redirect(u.toString());
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-[0.24em]">revlogic</span>
          <span className="label-mono">Projects</span>
        </div>
        {c.kind === "fatal" ? <p className="text-red m-0">{c.message}</p> : (
          <>
            <h1 className="m-0 text-[19px] font-semibold">Connect {product} to revlogic Projects?</h1>
            <p className="m-0 text-ink-2 leading-relaxed text-[14px]">
              {product} will be able to act as <b className="text-ink">{me?.name ?? "you"}</b>{me?.email ? ` (${me.email})` : ""}:
            </p>
            <ul className="m-0 pl-5 list-disc text-[14px] text-ink-2 leading-relaxed">
              <li>See your tasks and engagement summaries</li>
              <li>Add tasks and update their status, due date and your priority</li>
            </ul>
            <p className="m-0 text-xs text-ink-3">It sees only what you can see in the app. You can disconnect it anytime on the Connections page.</p>
            <form action={decide} className="flex gap-2 justify-end">
              {KEYS.map((k) => <input key={k} type="hidden" name={k} value={p[k] ?? ""} />)}
              <button name="decision" value="deny" className="btn btn-ghost text-ink">Cancel</button>
              <button name="decision" value="allow" className="btn btn-primary">Allow</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
