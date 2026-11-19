// Note types and helpers shared by the server and the Notes tab.
export const NOTE_KINDS = [
  { id: "blocker", label: "Blocker", color: "#ff8a80", bg: "#452326" },
  { id: "dependency", label: "Dependency", color: "#f2c27b", bg: "#43361f" },
  { id: "meeting", label: "Meeting notes", color: "#a4c2f4", bg: "#22323d" },
  { id: "note", label: "Note", color: "#c3c7c5", bg: "#373a39" },
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number]["id"];

export const WAITING_ON = [
  { id: "client", label: "Client" },
  { id: "internal", label: "revlogic team" },
  { id: "vendor", label: "Partner / vendor" },
  { id: "other", label: "Other" },
] as const;

/**
 * Next steps written in a meeting note, as draft tasks: the lines after "Next steps" (or "Action items"),
 * split on bullets, new lines and "·". "Jesse sends the template" keeps its text; the owner is picked on screen.
 */
export function nextSteps(body: string | null | undefined): string[] {
  if (!body) return [];
  const m = body.match(/(?:next steps?|action items?|to ?dos?)\s*[:\-–]?\s*([\s\S]*)$/i);
  if (!m) return [];
  return m[1]!.split(/\n|·|•|;|(?:^|\s)-\s/).map((s) => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim()).filter((s) => s.length > 2).slice(0, 15);
}
