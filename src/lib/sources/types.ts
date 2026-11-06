// A piece of source material (a call, an email, a Slack message) that might contain tasks.
export type SourceItem = {
  provider: "aurasell" | "gmail" | "slack" | "otter";
  externalId: string;      // stable id so it is never processed twice
  title: string;           // "Tyler & Rick - Sync on Training" / email subject / "#hiddenlayer-internal"
  url?: string;            // link back to the original
  occurredAt: string;      // ISO timestamp
  participants: string[];  // names/emails
  text: string;            // the content Claude reads (trimmed)
  // Aurasell already extracts next steps with quotes; we pass them along as hints
  hints?: { nextStep: string; quote?: string; speaker?: string; at?: string }[];
};
