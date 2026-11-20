import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadEngagement } from "@/lib/load";
import { DesignBoard } from "@/components/design-board";
import { isDesignBoard, loadDesignBoard, canEditOptions } from "@/lib/design-board";
import { AsanaMigration } from "@/components/asana-migration";
import { asanaImportedCount } from "@/lib/asana-import";

export default async function CompletedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { me, e, tasks, people } = await loadEngagement(slug);
  if (!isDesignBoard(e.slug)) notFound();
  const { contractors, statuses } = await loadDesignBoard(e.id);
  const canEdit = await canEditOptions(me, e.id);
  return (
    <div className="flex flex-col gap-4">
      {canEdit && <AsanaMigration engagementId={e.id} imported={await asanaImportedCount(e.id)} />}
      <Suspense><DesignBoard engagementId={e.id} mode="done" tasks={tasks} contractors={contractors} statuses={statuses} people={people} canEdit={canEdit} me={{ id: me.id, role: me.role }} /></Suspense>
    </div>
  );
}
