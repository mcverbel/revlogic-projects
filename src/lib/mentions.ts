import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * @mentions: people picked from the suggestions, plus "@First Last" typed by hand.
 * A bare "@first" only counts when exactly one teammate has that first name.
 */
export async function findMentions(body: string, mentionIds: string[]) {
  const people = await db.select().from(users);
  const lower = body.toLowerCase();
  const tagged = (s: string) => new RegExp(`@${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu").test(lower);
  const ids = new Set<string>();
  for (const p of people) {
    if (mentionIds.includes(p.id) && lower.includes(`@${p.name.toLowerCase()}`)) ids.add(p.id);
    else if (p.name && tagged(p.name.toLowerCase())) ids.add(p.id);
  }
  for (const p of people) {
    const first = p.name.split(" ")[0]!.toLowerCase();
    if (!first || ids.has(p.id) || !tagged(first)) continue;
    const same = people.filter((x) => x.name.split(" ")[0]!.toLowerCase() === first);
    if (same.length === 1 && !people.some((x) => ids.has(x.id) && x.name.toLowerCase().startsWith(first + " "))) ids.add(p.id);
  }
  const mentioned = people.filter((p) => ids.has(p.id));
  return mentioned;
}

