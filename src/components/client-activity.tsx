"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActivityEmail, ActivityMeeting, ClientActivity, Person } from "@/lib/client-activity";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (iso: string) => Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / DAY);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const date = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const ago = (iso: string) => {
  const d = -dayDiff(iso);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const first = (p: Person | null) => p?.name.split(" ")[0] ?? "Someone";
const names = (ps: Person[], max = 4) => {
  const shown = ps.slice(0, max).map((p) => (p.client ? `${p.name.split(" ")[0]} (client)` : p.name.split(" ")[0]));
  return shown.join(", ") + (ps.length > max ? ` +${ps.length - max}` : "");
};

function Flag({ tone, children }: { tone: "amber" | "blue" | "red"; children: React.ReactNode }) {
  const c = { amber: ["#43361f", "#f2c27b"], blue: ["#22323d", "#a4c2f4"], red: ["#452326", "#ff8a80"] }[tone];
  return <span className="inline-flex items-center gap-1.5 min-h-8 px-3 rounded-[9px] text-[13px] font-medium" style={{ background: c[0], color: c[1] }}>{children}</span>;
}

export function ClientActivityCard({ data, slug }: { data: ClientActivity; slug: string }) {
  if (data.state !== "ok") {
    const msg = data.state === "no_account"
      ? "This project isn't linked to the client in Aurasell yet. Add the client's email domain or Aurasell account id in Settings."
      : "The client's meetings and emails show up here after the next Aurasell sync.";
    return (
      <section className="card px-5 py-4 flex flex-wrap items-center gap-3" aria-label="Client activity">
        <span className="text-[15px] font-semibold">Client activity</span>
        <span className="text-[13px] text-ink-3 flex-1 min-w-[200px]">{msg}</span>
      </section>
    );
  }

  const next = data.upcoming[0];
  const nextIn = next ? dayDiff(next.start) : null;
  const latest = data.latestEmail;
  const silentDays = data.lastContact ? -dayDiff(data.lastContact) : null;
  const notesHref = (m: ActivityMeeting) =>
    `/e/${slug}/notes?new=meeting&title=${encodeURIComponent(m.title)}&date=${encodeURIComponent(new Date(m.start).toLocaleDateString("en-CA"))}&with=${encodeURIComponent(m.people.map((p) => p.name).join(", "))}${m.link ? `&link=${encodeURIComponent(m.link)}` : ""}`;

  return (
    <section className="card px-5 py-4 flex flex-col gap-4" aria-label="Client activity">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[15px] font-semibold">Client activity</h2>
        <span className="text-xs text-ink-3">From Aurasell{data.accountName ? ` · ${data.accountName}` : ""} · updated {ago(data.fetchedAt) === "today" ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ago(data.fetchedAt)}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {latest?.fromClient && <Flag tone="amber">✉️ {first(latest.from)} replied {ago(latest.at)}, no answer yet</Flag>}
          {next && nextIn === 0 && <Flag tone="blue">📅 Meeting today at {time(next.start)}</Flag>}
          {next && nextIn === 1 && <Flag tone="blue">📅 Meeting tomorrow</Flag>}
          {silentDays !== null && silentDays >= 21 && <Flag tone="red">⚠️ No contact in {silentDays} days</Flag>}
        </span>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        <Box title="Next meeting">
          {next ? (
            <>
              <span className="text-[16px] font-semibold leading-snug">{next.title}</span>
              <span className="text-[13.5px]">
                {nextIn === 0 || nextIn === 1 ? <b className="text-mint">{nextIn === 0 ? "Today" : "Tomorrow"}</b> : null}
                {nextIn === 0 || nextIn === 1 ? " · " : ""}{date(next.start)} · {time(next.start)}{next.end ? `–${time(next.end)}` : ""}
              </span>
              {next.people.length > 0 && <span className="text-[12.5px] text-ink-2">{names(next.people, 5)}</span>}
              <span className="flex flex-wrap gap-2">
                {next.link && <a className="btn btn-primary no-underline" href={next.link} target="_blank" rel="noreferrer">Join</a>}
                <Link className="btn btn-ghost no-underline text-ink" href={notesHref(next)}>Add meeting notes</Link>
              </span>
              {data.upcoming[1] && <span className="text-xs text-ink-3">Then: {date(data.upcoming[1].start)} · {data.upcoming[1].title}</span>}
            </>
          ) : <span className="text-[13px] text-ink-3">No meeting scheduled.</span>}
        </Box>

        <Box title="Last meetings">
          {data.past.length === 0 && <span className="text-[13px] text-ink-3">No meetings in the last 90 days.</span>}
          {data.past.map((m, i) => <PastMeeting key={m.id} m={m} first={i === 0} notesHref={notesHref(m)} />)}
        </Box>

        <Box title="Latest emails">
          {!data.lastFromClient && !data.lastFromUs && <span className="text-[13px] text-ink-3">No emails in the last 90 days.</span>}
          {data.lastFromClient && <Email e={data.lastFromClient} first />}
          {data.lastFromUs && <Email e={data.lastFromUs} first={!data.lastFromClient} />}
        </Box>
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-3 border-t border-line-2 pt-2.5">
        <span>{data.lastContact ? `Last contact: ${ago(data.lastContact)}` : "No contact in the last 90 days"} · {data.meetings30} meeting{data.meetings30 === 1 ? "" : "s"} and {data.emails30} email{data.emails30 === 1 ? "" : "s"} in the last 30 days</span>
      </div>
    </section>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line-2 bg-[#262827] p-3.5 flex flex-col gap-2.5 min-w-0">
      <span className="label-mono text-[11px]">{title}</span>
      {children}
    </div>
  );
}

function PastMeeting({ m, first, notesHref }: { m: ActivityMeeting; first: boolean; notesHref: string }) {
  const [open, setOpen] = useState(false);
  const d = new Date(m.start);
  return (
    <div className={`flex gap-2.5 items-start ${first ? "" : "border-t border-line-2 pt-2.5"}`}>
      <span className="shrink-0 w-[46px] text-center rounded-lg bg-[#323534] py-1 leading-tight">
        <b className="block text-[16px]">{String(d.getDate()).padStart(2, "0")}</b>
        <span className="text-[10.5px] text-ink-3 uppercase tracking-wider">{d.toLocaleDateString([], { month: "short" })}</span>
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13.5px] font-medium leading-snug">{m.title} {m.heat && <span className="whitespace-nowrap text-[11px] px-1.5 rounded-full bg-[#4a2a24] text-[#ffb199] font-normal">{m.heat}</span>}</span>
        <span className="text-xs text-ink-3">{[m.minutes ? `${m.minutes} min` : null, names(m.people, 3)].filter(Boolean).join(" · ")}</span>
        <span className="flex flex-wrap gap-2.5 text-xs">
          {m.summary && (
            <button type="button" className="text-mint hover:underline cursor-pointer" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide summary" : "Summary"}
            </button>
          )}
          <Link href={notesHref} className="text-ink-3 hover:text-mint no-underline">Add notes</Link>
        </span>
        {open && m.summary && (
          <span className="mt-1 text-[12.5px] text-ink-2 whitespace-pre-wrap rounded-md bg-sunken border border-line-2 p-2">{m.summary}</span>
        )}
      </span>
    </div>
  );
}

function Email({ e, first: isFirst }: { e: ActivityEmail; first: boolean }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${isFirst ? "" : "border-t border-line-2 pt-2.5"}`}>
      <span className="self-start text-[11px] font-semibold tracking-wide px-1.5 rounded"
        style={e.fromClient ? { background: "#43361f", color: "#f2c27b" } : { background: "#1f3a2c", color: "#8be3b7" }}>
        {e.fromClient ? "FROM CLIENT" : "FROM REVLOGIC"} · {new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}
      </span>
      <span className="text-[13.5px] font-medium leading-snug">{e.title}</span>
      <span className="text-xs text-ink-3 truncate">{first(e.from)} → {names(e.to, 3)}</span>
      {e.snippet && <span className="text-[12.5px] text-ink-2 truncate">{e.snippet}</span>}
    </div>
  );
}
