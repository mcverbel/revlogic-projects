"use client";

import { SlackTest } from "./slack-test";

import { useState, useTransition } from "react";
import { disconnect, saveOtterKey, createApiToken, revokeApiToken } from "@/actions/connections";
import { signInAgain } from "@/actions/reconnect";

type St = { connected: boolean; needsReconnect: boolean; lastSyncedAt: string | null };

function Row({ mono, tone, name, reads, connected, meta, action }: { mono: string; tone: [string, string]; name: string; reads: string; connected: boolean; meta: string; action: React.ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-4 px-5 py-4">
      <span aria-hidden className="w-10 h-10 rounded-[10px] inline-flex items-center justify-center font-semibold text-[13px] shrink-0" style={{ background: tone[0], color: tone[1] }}>{mono}</span>
      <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{name}</span>
          <span className="pill" style={connected ? { background: "#1f3a2c", color: "#8be3b7" } : { background: "#373a39", color: "#c3c7c5" }}>{connected ? "Connected" : "Not connected"}</span></div>
        <span className="text-[13px] text-ink-2 leading-snug">{reads}</span>
        <span className="text-xs text-ink-3">{meta}</span>
      </div>
      <div className="flex gap-2 flex-wrap">{action}</div>
    </div>
  );
}

export function ConnectionsView({ isAdmin, company, mine, slackOAuthReady, tokens, appUrl, refreshUrl }: {
  isAdmin: boolean; company: { aurasell: boolean; aurasellSyncedAt: string | null; slackApp: boolean; claude: boolean };
  mine: { gmail: St; slackUser: St; otter: St; aurasell: St }; slackOAuthReady: boolean;
  tokens: { id: string; label: string; lastUsedAt: string | null }[]; appUrl: string; refreshUrl: string | null;
}) {
  const [pending, start] = useTransition();
  const [otterKey, setOtterKey] = useState("");
  const [newToken, setNewToken] = useState("");
  const envNote = isAdmin ? "Set in the app's environment variables (see README)." : "An admin sets this up once.";
  return (
    <div className="flex flex-col gap-7 max-w-[1100px]">
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-medium">Connections</h1>
        <p className="m-0 text-ink-2 leading-relaxed max-w-[760px]">Where suggested tasks come from. Only items tied to an engagement are read: meetings on a linked Aurasell account, emails with a client&apos;s domain, and Slack channels mapped to an engagement. Claude keeps the short quote it used, never the full message.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="label-mono m-0 font-medium">Company · set up once by an admin</h2>
        <Row mono="SL" tone={["#362b45", "#c9a6f2"]} name="Slack workspace app" connected={company.slackApp} reads="Channels mapped to each engagement (internal and client). Also sends task, mention and milestone notifications." meta={company.slackApp ? "Invite the app to each engagement channel" : envNote} action={null} />
        <Row mono="AI" tone={["#1f3340", "#8cc8ee"]} name="Claude API" connected={company.claude} reads="Turns calls, emails and Slack messages into suggested tasks." meta={company.claude ? "Ready" : envNote} action={null} />
      </section>

      <SlackTest />

      <section className="flex flex-col gap-3">
        <h2 className="label-mono m-0 font-medium">Mine · only I can connect these</h2>
        <Row mono="AS" tone={["#23392f", "#8be3b7"]} name="Aurasell"
          connected={!!company.aurasellSyncedAt && Date.now() - Date.parse(company.aurasellSyncedAt) < 24 * 3600_000}
          reads="Recorded calls and their next steps on accounts linked to your engagements. Read by a scheduled Claude task through the Aurasell connector in Claude, then sent here as suggested tasks."
          meta={company.aurasellSyncedAt
            ? `Last synced ${new Date(company.aurasellSyncedAt).toLocaleString()}${Date.now() - Date.parse(company.aurasellSyncedAt) >= 24 * 3600_000 ? " · no sync in the last 24 hours, check the scheduled task" : ""}`
            : "Turns on when the scheduled Claude task first syncs (after the app is deployed)."}
          action={refreshUrl ? <a href={refreshUrl} target="_blank" rel="noreferrer" className="btn btn-ghost no-underline text-ink">Refresh Aurasell</a> : null} />
        <Row mono="GM" tone={["#43361f", "#f2c27b"]} name="Gmail + Drive" connected={mine.gmail.connected} reads="Read-only. Only email threads with a client domain from your engagements, and Drive file names for document previews."
          meta={mine.gmail.needsReconnect ? "Access expired. Sign in again to reconnect." : mine.gmail.connected ? "Turned on when you signed in with Google" : "Sign in again and allow Gmail access."}
          action={mine.gmail.connected
            ? <button className="btn btn-ghost" disabled={pending} onClick={() => start(() => disconnect("gmail"))}>Disconnect</button>
            : <form action={signInAgain}><button className="btn btn-primary">Connect</button></form>} />
        <Row mono="DM" tone={["#362b45", "#c9a6f2"]} name="My Slack DMs" connected={mine.slackUser.connected} reads="Optional. Your DMs and group DMs that mention a client from your engagements."
          meta={mine.slackUser.connected ? "Connected as you" : slackOAuthReady ? "Only needed for tasks that live in DMs." : "Waiting for an admin to finish the Slack app setup."}
          action={mine.slackUser.connected
            ? <button className="btn btn-ghost" disabled={pending} onClick={() => start(() => disconnect("slack_user"))}>Disconnect</button>
            : slackOAuthReady ? <a className="btn btn-primary no-underline" href="/api/connect/slack">Connect</a> : null} />
        <Row mono="OT" tone={["#1f3340", "#8cc8ee"]} name="Otter" connected={mine.otter.connected} reads="Your Otter transcripts for calls with a client, for meetings Aurasell did not record."
          meta={mine.otter.connected ? "Connected as you" : "Paste your Otter API key."}
          action={mine.otter.connected
            ? <button className="btn btn-ghost" disabled={pending} onClick={() => start(() => disconnect("otter"))}>Disconnect</button>
            : <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await saveOtterKey(otterKey); setOtterKey(""); }); }}>
                <input className="field w-56" type="password" placeholder="Otter API key" value={otterKey} onChange={(e) => setOtterKey(e.target.value)} aria-label="Otter API key" />
                <button className="btn btn-primary" disabled={!otterKey.trim()}>Connect</button></form>} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-mono m-0 font-medium">Use the tracker from your own Claude</h2>
        <div className="card px-5 py-4 flex flex-col gap-3">
          <p className="m-0 text-[13px] text-ink-2 leading-relaxed">Create a personal token, then add a custom connector in Claude with the URL <code className="text-mint">{appUrl}/api/mcp</code> and this token. Your Claude can then list your tasks, update them and add new ones. Every call acts as you.</p>
          {newToken && <div className="p-3 rounded-lg bg-bg border border-[#2f6b4d] text-[13px]">Copy this now, it won&apos;t be shown again: <code className="text-mint break-all">{newToken}</code></div>}
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 text-[13px]"><span>{t.label} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}</span>
              <button className="btn btn-quiet hover:text-red" onClick={() => start(() => revokeApiToken(t.id))}>Revoke</button></div>
          ))}
          <button className="btn btn-ghost self-start" disabled={pending} onClick={() => start(async () => setNewToken(await createApiToken("Claude")))}>Create token</button>
        </div>
      </section>
    </div>
  );
}
