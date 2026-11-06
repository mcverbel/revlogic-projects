import { loadEngagement } from "@/lib/load";
import { PeopleView } from "@/components/people-view";

export default async function PeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, members, contacts, people, tasks } = await loadEngagement(slug);
  const openTasksByUser: Record<string, number> = {};
  for (const t of tasks.filter((t) => t.status !== "done")) for (const id of [t.ownerId, ...t.assigneeIds]) if (id) openTasksByUser[id] = (openTasksByUser[id] ?? 0) + 1;
  return <PeopleView engagementId={e.id} members={members} contacts={contacts} people={people} openTasksByUser={openTasksByUser} />;
}
