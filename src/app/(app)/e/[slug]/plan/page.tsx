import { Suspense } from "react";
import { loadEngagement } from "@/lib/load";
import { PlanView } from "@/components/plan-view";
import { DesignBoard } from "@/components/design-board";
import { isDesignBoard, loadDesignBoard, canEditOptions } from "@/lib/design-board";

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { me, e, tasks, phases, people } = await loadEngagement(slug);
  if (isDesignBoard(e.slug)) {
    const { contractors, statuses } = await loadDesignBoard(e.id);
    return <Suspense><DesignBoard engagementId={e.id} mode="open" tasks={tasks} contractors={contractors} statuses={statuses} people={people} canEdit={await canEditOptions(me, e.id)} /></Suspense>;
  }
  return <Suspense><PlanView engagementId={e.id} tasks={tasks} phases={phases} people={people} /></Suspense>;
}
