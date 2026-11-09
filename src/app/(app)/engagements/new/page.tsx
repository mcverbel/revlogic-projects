import { PersonField } from "@/components/person-picker";
import { createEngagement } from "@/actions/engagements";
import { allUsers } from "@/lib/queries";
import { JOURNEY, CATEGORIES, categoryOf } from "@/lib/constants";
import { requireUser } from "@/lib/session";

export default async function NewEngagement({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const me = await requireUser();
  const cat = categoryOf((await searchParams).category);
  const isEng = cat.id === "engagement";
  const people = await allUsers();
  const F = ({ label, name, placeholder, type = "text", hint }: { label: string; name: string; placeholder?: string; type?: string; hint?: string }) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">{label}<input className="field" name={name} type={type} placeholder={placeholder} />{hint && <span className="text-xs text-ink-3">{hint}</span>}</label>
  );
  return (
    <>
      <h1 className="m-0 text-[28px] font-medium">New {cat.singular}</h1>
      <form action={createEngagement} className="card p-6 grid gap-5 max-w-3xl" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Menu section
          <select className="field" name="category" defaultValue={cat.id}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">{cat.id === "partner" ? "Partner name *" : isEng ? "Client name *" : "Client or team *"}<input className="field" name="clientName" required placeholder={cat.id === "partner" ? "Peppr.ai" : isEng ? "HiddenLayer" : "revlogic Marketing"} /></label>
        <F label="Client email domain" name="clientDomain" placeholder="hiddenlayer.com" hint="Emails with this domain feed Suggested tasks." />
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">{isEng ? "Engagement name *" : "Project name *"}<input className="field" name="name" required placeholder={isEng ? "SKO Sales Training" : "Project name"} /></label>
        <F label="revlogic service" name="serviceLine" placeholder="e.g. valueREV, dealREV, SKO" />
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Where it is now
          <select className="field" name="journeyStage" defaultValue="stage_0">{JOURNEY.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Engagement lead
          <PersonField name="leadUserId" people={people.map((p) => ({ id: p.id, name: p.name, email: p.email, avatarUrl: p.avatarUrl }))} defaultValue={me.id} noneLabel="No lead yet" label="Lead" />
        </label>
        <F label="Start date" name="startDate" type="date" />
        <F label="End date" name="endDate" type="date" />
        <F label="Aurasell account id" name="aurasellAccountId" hint="Calls on this account feed Suggested tasks." />
        <F label="Aurasell opportunity id" name="aurasellOpportunityId" hint="Keeps the deal stage in sync." />
        <F label="Google Drive folder link" name="driveFolderUrl" />
        <F label="Slack internal channel id" name="slackInternalChannelId" placeholder="C0123…" />
        <F label="Slack external channel id" name="slackExternalChannelId" placeholder="C0456…" />
        <div className="col-span-full flex justify-end"><button className="btn btn-primary min-h-11">Create {cat.singular}</button></div>
      </form>
    </>
  );
}
