import { db } from "@/db";
import { engagementMembers, tasks } from "@/db/schema";
import { allUsers } from "@/lib/queries";
import { Avatar } from "@/components/ui";
import { ne } from "drizzle-orm";

export default async function TeamPage() {
  const [people, members, open] = await Promise.all([allUsers(), db.select().from(engagementMembers), db.select().from(tasks).where(ne(tasks.status, "done"))]);
  return (
    <>
      <h1 className="m-0 text-[28px] font-medium">Team</h1>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {people.map((p) => (
          <div key={p.id} className="card p-4 flex items-center gap-3">
            <Avatar name={p.name} src={p.avatarUrl} size={40} />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold truncate">{p.name}</span>
              <span className="text-[13px] text-ink-2">{members.filter((m) => m.userId === p.id).length} engagements · {open.filter((t) => t.ownerId === p.id).length} open tasks</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
