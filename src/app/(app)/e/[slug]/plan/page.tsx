import { Suspense } from "react";
import { loadEngagement } from "@/lib/load";
import { PlanView } from "@/components/plan-view";

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, tasks, phases, people } = await loadEngagement(slug);
  return <Suspense><PlanView engagementId={e.id} tasks={tasks} phases={phases} people={people} /></Suspense>;
}
