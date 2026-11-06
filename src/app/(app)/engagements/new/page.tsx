import { createEngagement } from "@/actions/engagements";
import { allUsers } from "@/lib/queries";
import { JOURNEY } from "@/lib/constants";
import { requireUser } from "@/lib/session";

export default async function NewEngagement() {
  const me = await requireUser();
  const people = await allUsers();
  const F = ({ label, name, placeholder, type = "text", hint }: { label: string; name: string; placeholder?: string; type?: string; hint?: string }) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">{label}<input className="field" name={name} type={type} placeholder={placeholder} />{hint && <span className="text-xs text-ink-3">{hint}</span>}</label>
  );
  return (
    <>
      <h1 className="m-0 text-[28px] font-medium">New engagement</h1>
      <form action={createEngagement} className="card p-6 grid gap-5 max-w-3xl" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Client name *<input className="field" name="clientName" required placeholder="HiddenLayer" /></label>
        <F label="Client email domain" name="clientDomain" placeholder="hiddenlayer.com" hint="Emails with this domain feed Suggested tasks." />
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Engagement name *<input className="field" name="name" required placeholder="SKO Sales Training" /></label>
        <F label="revlogic service" name="serviceLine" placeholder="e.g. valueREV, dealREV, SKO" />
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Where it is now
          <select className="field" name="journeyStage" defaultValue="stage_0">{JOURNEY.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">Engagement lead
          <select className="field" name="leadUserId" defaultValue={me.id}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <F label="Start date" name="startDate" type="date" />
        <F label="End date" name="endDate" type="date" />
        <F label="Aurasell account id" name="aurasellAccountId" hint="Calls on this account feed Suggested tasks." />
        <F label="Aurasell opportunity id" name="aurasellOpportunityId" hint="Keeps the deal stage in sync." />
        <F label="Google Drive folder link" name="driveFolderUrl" />
        <F label="Slack internal channel id" name="slackInternalChannelId" placeholder="C0123…" />
        <F label="Slack external channel id" name="slackExternalChannelId" placeholder="C0456…" />
        <div className="col-span-full flex justify-end"><button className="btn btn-primary min-h-11">Create engagement</button></div>
      </form>
    </>
  );
}
