"use server";

import { requireUser } from "@/lib/session";
import { meetingSummary } from "@/lib/client-activity";

/** Aurasell's summary of a meeting, read with the viewer's own Aurasell sign-in. */
export async function loadMeetingSummary(messageId: string) {
  const me = await requireUser();
  return meetingSummary(messageId, me.id);
}
