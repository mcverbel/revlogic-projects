"use client";

import { useState, useTransition } from "react";
import type { clientContacts as ccT, users as usersT, engagementMembers as emT } from "@/db/schema";
import { addMember, removeMember } from "@/actions/engagements";
import { addContact, updateContact, deleteContact } from "@/actions/people-docs";
import { Avatar, Empty } from "./ui";
import { CONTACT_ROLES } from "@/lib/constants";

type Contact = typeof ccT.$inferSelect;
type User = typeof usersT.$inferSelect;
type Member = { m: typeof emT.$inferSelect; u: User };

const ROLE_TONE = (r: string): [string, string] =>
  ["Champion", "Economic Buyer (EB)", "Coach"].includes(r) ? ["#23392f", "#8be3b7"] : r === "Blocker" ? ["#452326", "#ff8a80"] : r === "Technical Buyer" ? ["#43361f", "#f2c27b"] : ["#2f3231", "#d5d8d6"];

export function PeopleView({ engagementId, members, contacts, people, openTasksByUser }: { engagementId: string; members: Member[]; contacts: Contact[]; people: User[]; openTasksByUser: Record<string, number> }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [memberForm, setMemberForm] = useState({ userId: "", role: "", tags: "" });
  const [addingContact, setAddingContact] = useState(false);
  const [c, setC] = useState({ name: "", title: "", email: "", linkedinUrl: "", role: "Champion", notes: "" });
  const notMembers = people.filter((p) => !members.some((m) => m.u.id === p.id));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">Internal team</h2>
          <button className="btn btn-ghost" onClick={() => setAdding(!adding)}>+ Add member</button>
        </div>
        {adding && (
          <form className="card p-4 flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { await addMember(engagementId, memberForm.userId, memberForm.role, memberForm.tags.split(",").map((t) => t.trim()).filter(Boolean)); setAdding(false); setMemberForm({ userId: "", role: "", tags: "" }); }); }}>
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">Person
              <select className="field" required value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })}>
                <option value="">Choose…</option>{notMembers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">Role on this engagement<input className="field" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} placeholder="LxD, Facilitator…" /></label>
            <label className="flex flex-col gap-1 text-[13px] text-ink-2 flex-1 min-w-[200px]">Tags (comma-separated)<input className="field" value={memberForm.tags} onChange={(e) => setMemberForm({ ...memberForm, tags: e.target.value })} /></label>
            <button className="btn btn-primary min-h-[38px]" disabled={pending || !memberForm.userId}>Add</button>
          </form>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {members.map(({ m, u }) => (
            <div key={u.id} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <Avatar name={u.name} src={u.avatarUrl} size={40} />
                <div className="flex flex-col min-w-0 flex-1"><span className="font-semibold truncate">{u.name}</span><span className="text-[13px] text-ink-2">{m.projectRole ?? "Team member"}</span></div>
                <button aria-label={`Remove ${u.name}`} className="text-ink-3 hover:text-red cursor-pointer" onClick={() => start(() => removeMember(engagementId, u.id))}>×</button>
              </div>
              {m.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{m.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
              <span className="text-xs text-ink-3">{openTasksByUser[u.id] ?? 0} open tasks</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">Client contacts and SMEs</h2>
          <button className="btn btn-ghost" onClick={() => setAddingContact(!addingContact)}>+ Add contact</button>
        </div>
        {addingContact && (
          <form className="card p-4 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
            onSubmit={(e) => { e.preventDefault(); start(async () => { await addContact(engagementId, { ...c, roles: [c.role] }); setAddingContact(false); setC({ name: "", title: "", email: "", linkedinUrl: "", role: "Champion", notes: "" }); }); }}>
            <input className="field" required placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} aria-label="Name" />
            <input className="field" placeholder="Title / role" value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} aria-label="Title" />
            <input className="field" type="email" placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} aria-label="Email" />
            <input className="field" placeholder="LinkedIn URL" value={c.linkedinUrl} onChange={(e) => setC({ ...c, linkedinUrl: e.target.value })} aria-label="LinkedIn URL" />
            <select className="field" value={c.role} onChange={(e) => setC({ ...c, role: e.target.value })} aria-label="Stakeholder role">{CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <input className="field" placeholder="Notes" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} aria-label="Notes" />
            <button className="btn btn-primary min-h-[38px] justify-center" disabled={pending}>Add contact</button>
          </form>
        )}
        <div className="card overflow-x-auto">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[190px_190px_190px_220px_60px_minmax(0,1fr)_30px] gap-3 px-4 py-3 text-xs font-semibold text-ink-3 border-b border-line">
              <span>Name</span><span>Title / role</span><span>Stakeholder</span><span>Email</span><span>LinkedIn</span><span>Notes</span><span />
            </div>
            {contacts.length === 0 && <Empty>No client contacts yet.</Empty>}
            {contacts.map((ct) => <ContactRow key={ct.id} ct={ct} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ ct }: { ct: Contact }) {
  const [, start] = useTransition();
  const roles = ct.roles.length ? ct.roles : [""];
  const setRoles = (next: string[]) => start(() => updateContact(ct.id, { roles: next.filter(Boolean) }));
  return (
    <div className="grid grid-cols-[190px_190px_190px_220px_60px_minmax(0,1fr)_30px] gap-3 px-4 py-3 border-b border-line-2 items-start text-[13px]">
      <span className="font-semibold text-[14px]">{ct.name}</span>
      <span className="text-ink-2">{ct.title}</span>
      <span className="flex flex-col gap-1.5">
        {roles.map((r, i) => {
          const [bg, fg] = ROLE_TONE(r);
          return (
            <select key={i} aria-label={`Stakeholder role for ${ct.name}`} defaultValue={r} className="field min-h-[32px] px-2 text-[12.5px] font-medium"
              style={{ background: bg, color: fg, borderColor: fg }} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">Choose role</option>{CONTACT_ROLES.map((o) => <option key={o}>{o}</option>)}
            </select>
          );
        })}
        <button className="self-start min-h-7 px-2.5 rounded-lg border border-dashed border-[#4f5553] text-[#c9cdcb] text-xs cursor-pointer"
          aria-label={`Add another role for ${ct.name}`} onClick={() => setRoles([...roles.filter(Boolean), CONTACT_ROLES.find((x) => !roles.includes(x)) ?? "Leader"])}>+ Role</button>
      </span>
      {ct.email ? <a href={`mailto:${ct.email}`} className="no-underline truncate">{ct.email}</a> : <span className="text-ink-3">—</span>}
      {ct.linkedinUrl ? <a href={ct.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`LinkedIn profile for ${ct.name}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line-3 font-semibold text-xs no-underline">in</a> : <span className="text-ink-3">—</span>}
      <textarea aria-label={`Notes on ${ct.name}`} className="bg-transparent text-ink-2 leading-snug resize-y border border-transparent hover:border-line-3 rounded p-1 -m-1 min-h-10" defaultValue={ct.notes ?? ""}
        onBlur={(e) => e.target.value !== (ct.notes ?? "") && start(() => updateContact(ct.id, { notes: e.target.value || null }))} />
      <button aria-label={`Remove ${ct.name}`} className="text-ink-3 hover:text-red cursor-pointer" onClick={() => confirm(`Remove ${ct.name}?`) && start(() => deleteContact(ct.id))}>×</button>
    </div>
  );
}
