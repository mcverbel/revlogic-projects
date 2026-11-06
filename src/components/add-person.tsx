"use client";

import { useState, useTransition } from "react";
import { invitePerson } from "@/actions/people";

export function AddPerson() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button className="btn btn-ghost" onClick={() => setOpen(true)}>+ Add person</button>;
  return (
    <form className="card p-4 flex flex-wrap gap-2 items-end w-full" onSubmit={(e) => {
      e.preventDefault(); setError("");
      start(async () => {
        try { await invitePerson(email, name); setEmail(""); setName(""); setOpen(false); }
        catch (err) { setError(err instanceof Error ? err.message : "Couldn't add them"); }
      });
    }}>
      <label className="flex flex-col gap-1 text-[13px] text-ink-2 flex-1 min-w-[220px]">Email<input className="field" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@rev-logic.com" /></label>
      <label className="flex flex-col gap-1 text-[13px] text-ink-2 flex-1 min-w-[180px]">Name<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
      <button className="btn btn-primary min-h-[38px]" disabled={pending}>Add</button>
      <button type="button" className="btn btn-ghost min-h-[38px]" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="w-full m-0 text-[13px] text-red">{error}</p>}
      <p className="w-full m-0 text-xs text-ink-3">You can add them to engagements and assign them tasks now. When they sign in with Google, everything will be waiting for them.</p>
    </form>
  );
}
