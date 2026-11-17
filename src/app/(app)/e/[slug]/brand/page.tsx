import { notFound } from "next/navigation";
import { loadEngagement } from "@/lib/load";
import { BrandTemplates } from "@/components/brand-templates";
import { isDesignBoard, loadDesignBoard, canEditOptions } from "@/lib/design-board";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { me, e } = await loadEngagement(slug);
  if (!isDesignBoard(e.slug)) notFound();
  const { brand } = await loadDesignBoard(e.id);
  return <BrandTemplates engagementId={e.id} clients={brand} canDelete={await canEditOptions(me, e.id)} />;
}
