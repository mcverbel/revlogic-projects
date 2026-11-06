import { cache } from "react";
import { notFound } from "next/navigation";
import { getEngagement } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const loadEngagement = cache(async (slug: string) => {
  const me = await requireUser();
  const data = await getEngagement(slug, me.id);
  if (!data) notFound();
  return { me, ...data };
});
