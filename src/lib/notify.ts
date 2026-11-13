// Task notifications sent as Slack DMs with a clean layout and an "Open task" button.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, engagements, clients } from "@/db/schema";
import { dmUser } from "@/lib/slack";
import { appUrl } from "@/lib/app-url";
import { fmtDate } from "@/lib/format";

type Kind = "owner" | "assignee" | "mention";

export async function notifyTask(opts: {
  to: string; by: { id: string; name: string }; kind: Kind;
  taskId: string; title: string; dueDate?: string | null; engagementId: string;
  comment?: string; note?: string;
}) {
  const [person, e] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, opts.to) }),
    db.query.engagements.findFirst({ where: eq(engagements.id, opts.engagementId) }),
  ]);
  if (!person || !e) return;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, e.clientId) });
  const first = person.name.split(" ")[0];
  const self = opts.to === opts.by.id;
  const project = client && client.name !== "revlogic" ? `${client.name} · ${e.name}` : e.name;
  const url = `${appUrl()}/e/${e.slug}/plan?task=${opts.taskId}`;

  const intro = opts.kind === "owner" ? `Hi ${first}, you've been assigned a new task:`
    : opts.kind === "assignee" ? `Hi ${first}, you've been added to a task:`
    : `Hi ${first}, ${self ? "you mentioned yourself" : `*${opts.by.name}* mentioned you`} on a task:`;
  const details = [opts.dueDate ? `:calendar: Due ${fmtDate(opts.dueDate)}` : ":calendar: No due date", `:file_folder: ${project}`].join("   ·   ");
  const footer = opts.kind === "mention" ? null
    : self ? (opts.kind === "owner" ? "You assigned this to yourself" : "You added yourself")
    : `${opts.kind === "owner" ? "Assigned" : "Added"} by ${opts.by.name}`;

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: intro } },
    { type: "section", text: { type: "mrkdwn", text: `*${opts.title}*\n${details}` } },
  ];
  if (opts.comment) blocks.push({ type: "section", text: { type: "mrkdwn", text: `> ${opts.comment.slice(0, 280).replace(/\n/g, "\n> ")}` } });
  if (opts.note) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: opts.note }] });
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open task" }, url, style: "primary", action_id: "open_task" }] });
  if (footer) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footer }] });

  const fallback = `${intro.replace(/\*/g, "")} ${opts.title}${opts.dueDate ? ` - Due ${fmtDate(opts.dueDate)}` : ""} - ${project}`;
  await dmUser(opts.to, fallback, blocks);
}
