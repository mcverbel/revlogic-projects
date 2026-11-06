import { loadEngagement } from "@/lib/load";
import { DocsView } from "@/components/docs-view";

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, docs, people } = await loadEngagement(slug);
  return <DocsView engagementId={e.id} docs={docs} people={people} />;
}
