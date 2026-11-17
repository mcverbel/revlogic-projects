import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadEngagement } from "@/lib/load";
import { DesignBoard } from "@/components/design-board";
import { isDesignBoard, loadDesignBoard, canEditOptions } from "@/lib/design-board";

export default async function CompletedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { me, e, tasks, people } = await loadEngagement(slug);
  if (!isDesignBoard(e.slug)) notFound();
  const { contractors, statuses } = await loadDesignBoard(e.id);
  return <Suspense><DesignBoard engagementId={e.id} mode="done" tasks={tasks} contractors={contractors} statuses={statuses} people={people} canEdit={await canEditOptions(me, e.id)} /></Suspense>;
}
