/**
 * Seeds the HiddenLayer pilot. Safe to run once on an empty database: `npm run db:seed`.
 * People sign in with Google afterwards; their user rows are matched by email.
 */
import "dotenv/config";
import { db } from "../src/db";
import { users, clients, engagements, engagementMembers, clientContacts, engagementSources, phases, suggestions } from "../src/db/schema";
import { sha256 } from "../src/lib/crypto";
import { eq } from "drizzle-orm";

async function upsertUser(email: string, name: string, role: "admin" | "member" = "member") {
  const [u] = await db.insert(users).values({ email, name, role }).onConflictDoUpdate({ target: users.email, set: { name } }).returning();
  return u!;
}

async function main() {
  const maria = await upsertUser("maria@rev-logic.com", "Maria Verbel", "admin");
  const rick = await upsertUser("rick@rev-logic.com", "Rick Kickert");
  const vaughn = await upsertUser("vaughn.heaston@rev-logic.com", "Vaughn Heaston");

  if (await db.query.engagements.findFirst({ where: eq(engagements.slug, "hiddenlayer-sko-sales-training") })) {
    console.log("HiddenLayer already seeded");
    process.exit(0);
  }
  const [client] = await db.insert(clients).values({ name: "HiddenLayer", domain: "hiddenlayer.com", aurasellAccountId: "019f90c9-a71b-73a6-9be4-68fa43879f3a" }).returning();
  const [e] = await db.insert(engagements).values({
    slug: "hiddenlayer-sko-sales-training", clientId: client!.id, name: "SKO Sales Training", serviceLine: "SKO",
    journeyStage: "stage_5", leadUserId: rick.id, createdBy: maria.id,
  }).returning();
  await db.insert(engagementMembers).values([
    { engagementId: e!.id, userId: rick.id, projectRole: "Engagement Lead", tags: ["Lead"] },
    { engagementId: e!.id, userId: maria.id, projectRole: "Operations", tags: ["SOW", "Materials"] },
    { engagementId: e!.id, userId: vaughn.id, projectRole: "Facilitator", tags: ["SKO design"] },
  ]);
  await db.insert(clientContacts).values({ engagementId: e!.id, name: "Tyler Reinhard", email: "treinhard@hiddenlayer.com", roles: ["Champion"], notes: "Planning their late-February SKO. Briefing their CRO on the training approach." });
  await db.insert(engagementSources).values([
    { engagementId: e!.id, kind: "email_domain", value: "hiddenlayer.com" },
    { engagementId: e!.id, kind: "aurasell_account", value: "019f90c9-a71b-73a6-9be4-68fa43879f3a" },
  ]);
  await db.insert(phases).values([{ engagementId: e!.id, name: "Pursuit", sortOrder: 0 }]);

  // The suggestions found on Nov 6, 2026 (real call + emails), so the Suggested tab has something to review on day one
  const call = "Tyler & Rick - Sync on Training";
  const mail = "Re: RevXcel x HiddenLayer - Pricing Coming";
  const s = (title: string, kind: "task" | "waiting_on_client" | "milestone_estimate", ownerIds: string[], provider: "aurasell" | "gmail", label: string, quote: string, extra: Partial<typeof suggestions.$inferInsert> = {}) => ({
    engagementId: e!.id, title, kind, ownerIds, fingerprint: sha256(`${e!.id}:${title.toLowerCase()}`),
    sources: [{ provider, label, quote, externalId: `seed-${sha256(title).slice(0, 8)}` }], ...extra,
  });
  await db.insert(suggestions).values([
    s("Create an \"Understanding of your Business\" slide from what HiddenLayer shared on the call", "task", [maria.id], "gmail", `Rick → Maria · ${mail} · Nov 6`,
      "@Maria Verbel - Could you create an 'Understanding of your Business' slide based on the information we received today?",
      { looksDoneEvidence: "Slack · Maria shared \"HiddenLayer - Understanding of your business\" with Vaughn on Nov 6, 12:07 PM." }),
    s("Draft a follow-up email for Rick to send, with the Value Framework structure and the Understanding slide in the body", "task", [maria.id], "gmail", `Rick → Maria · ${mail} · Nov 6`,
      "Can you put together a followup email that I can send. It should also show our Value Framework Structure and the 'Understanding of your Business' slide in the body of it."),
    s("Revise the SOW: remove Intelligent Simulation (likely rampREV too) and move it to the new template", "task", [], "gmail", `Rick · ${mail} · Nov 5`,
      "At a minimum we will need to remove the Intelligent Simulation. My guess is that they will remove ramp rev also. We will want to transfer to new template."),
    s("Update the SKO training scope and materials for ~45 attendees (~15 sellers plus solution architects and GTM)", "task", [maria.id], "aurasell", `Rick · 30:44 · ${call}`,
      "Maria is going to work on updating a few things. How many sellers do you have? — We're planning for like 15… a total headcount of like 45."),
    s("Help Tyler with the overall SKO flow and best practices, not just the training workshop", "task", [rick.id, vaughn.id], "aurasell", `Vaughn · 31:18 · ${call}`,
      "Even if you want us to help you just look at the overall SKO and the flow of it and kind of put together best practices… we're happy to jump in."),
    s("Follow up with Tyler if we haven't heard back", "task", [rick.id], "aurasell", `Tyler · 31:35 · ${call}`,
      "I'll be in touch. If you haven't heard from me by like Monday or Tuesday, shoot me a note.", { dueDate: "2026-11-10", dueText: "by Monday or Tuesday" }),
    s("Tyler briefs their CRO on the proposed training; possible extra scoping call", "waiting_on_client", [], "aurasell", `Tyler · 30:31 · ${call}`,
      "I'm meeting with [their CRO] now, so let me give him this like baseline information… maybe we have one more kind of like scoping overview call.", { externalOwner: "Tyler Reinhard" }),
    s("Start SKO training prep (needed ~6 weeks before a late-February SKO)", "milestone_estimate", [rick.id], "aurasell", `Claude estimate · not said on the call`,
      "Based on Rick's \"about six weeks\" of preparation and the late-February SKO date. Confirm the SKO date before accepting.", { dueText: "mid-January (estimate)" }),
  ]);
  console.log("Seeded HiddenLayer:", e!.slug);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
