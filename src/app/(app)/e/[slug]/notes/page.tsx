import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadEngagement } from "@/lib/load";
import { loadNotes } from "@/lib/notes";
import { categoryOf } from "@/lib/constants";
import { NotesView } from "@/components/notes-view";

export default async function NotesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { me, e, tasks, people } = await loadEngagement(slug);
  if (categoryOf(e.category).section === "creative") notFound();
  const notes = await loadNotes(e.id, me.id);
  return (
    <Suspense>
      <NotesView engagementId={e.id} notes={notes} people={people} me={{ id: me.id, role: me.role }}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))} />
    </Suspense>
  );
}
