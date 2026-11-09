/** Where a project sits in the left menu. Creative has two buckets. */
export const CATEGORIES = [
  { id: "engagement", label: "Engagements", singular: "engagement", section: "engagement" },
  { id: "creative_design", label: "Creative · Graphic Design", singular: "graphic design project", section: "creative" },
  { id: "creative_video", label: "Creative · Video", singular: "video project", section: "creative" },
  { id: "partner", label: "Partners", singular: "partner", section: "partner" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
/** "creative" (before the buckets existed) counts as Graphic Design. */
export const categoryOf = (id: string | null | undefined) =>
  CATEGORIES.find((c) => c.id === (id === "creative" ? "creative_design" : id)) ?? CATEGORIES[0];
export const SECTIONS = [
  { id: "engagement", label: "Engagements" },
  { id: "creative", label: "Creative", buckets: [
    { id: "creative_design", label: "Graphic Design", icon: "pen" },
    { id: "creative_video", label: "Video", icon: "video" },
  ] },
  { id: "partner", label: "Partners" },
] as const;

export const DEAL_STAGES = [
  { id: "stage_0", label: "Stage 0 - Pipeline Generation", short: "Pipeline Generation" },
  { id: "stage_1", label: "Stage 1 - New Business Meeting", short: "New Business Meeting" },
  { id: "stage_2", label: "Stage 2 - Business Alignment", short: "Business Alignment" },
  { id: "stage_3", label: "Stage 3 - Validate Solution & Impact", short: "Validate Solution & Impact" },
  { id: "stage_4", label: "Stage 4 - EB Echoback", short: "EB Echoback" },
  { id: "stage_5", label: "Stage 5 - Proposal & Negotiation", short: "Proposal & Negotiation" },
  { id: "closed_won", label: "Closed Won", short: "Closed Won" },
] as const;

export const DELIVERY_STAGES = [
  { id: "kickoff", label: "Kickoff", short: "Kickoff" },
  { id: "in_delivery", label: "In delivery", short: "In delivery" },
  { id: "wrap_up", label: "Wrap-up", short: "Wrap-up" },
  { id: "complete", label: "Complete", short: "Complete" },
] as const;

export const JOURNEY = [...DEAL_STAGES, ...DELIVERY_STAGES];
export type JourneyId = (typeof JOURNEY)[number]["id"] | "closed_lost" | "on_hold";

export function journeyLabel(id: string) {
  if (id === "closed_lost") return "Closed Lost";
  if (id === "on_hold") return "On hold";
  return JOURNEY.find((j) => j.id === id)?.label ?? id;
}
export function isPursuit(id: string) {
  return DEAL_STAGES.some((s) => s.id === id && s.id !== "closed_won");
}

// Aurasell stage label -> journey id
export function journeyFromAurasellStage(label: string, status?: string): JourneyId | null {
  if (status === "closed_won" || /closed won/i.test(label)) return "closed_won";
  if (status === "closed_lost" || /closed lost/i.test(label)) return "closed_lost";
  const m = label.match(/Stage\s*(\d)/i);
  if (m) return `stage_${m[1]}` as JourneyId;
  return null;
}

export const TASK_STATUSES = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "in_review", label: "In review" },
  { id: "done", label: "Done" },
] as const;

export const PRIORITIES = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
] as const;

export const MY_PRIORITIES = [
  { id: "", label: "None" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "top", label: "Top" },
] as const;

export const CONTACT_ROLES = [
  "Champion", "Economic Buyer (EB)", "Coach", "Blocker", "Technical Buyer", "Leader",
  "Sales", "Marketing", "Customer", "Sponsor", "SME", "Day-to-day",
];

export const DOC_TYPES = {
  governance: ["SOW", "Contract", "Kickoff deck", "Call recording", "Email thread", "Proposal", "Other"],
  deliverable: ["Deck", "Playbook", "Framework", "Template", "Workshop", "Training", "Other"],
} as const;

export const DOC_SOURCES = ["Google Slides", "Google Docs", "Google Sheets", "PDF", "Recording", "Gmail", "Figma", "Other"];

export const DEPARTMENTS = ["Sales", "Delivery", "LxD", "Creative", "Finance", "Marketing", "Operations"];
