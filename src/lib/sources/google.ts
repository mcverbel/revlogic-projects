import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import type { SourceItem } from "./types";

export async function googleAccessToken(userId: string): Promise<string | null> {
  const c = await db.query.connections.findFirst({ where: and(eq(connections.userId, userId), eq(connections.provider, "gmail"), eq(connections.status, "active")) });
  if (!c?.encryptedToken) return null;
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return decrypt(c.encryptedToken);
  if (!c.encryptedRefreshToken) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: decrypt(c.encryptedRefreshToken), grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) {
    await db.update(connections).set({ status: "needs_reconnect" }).where(eq(connections.id, c.id));
    return null;
  }
  await db.update(connections).set({ encryptedToken: encrypt(j.access_token), expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000) }).where(eq(connections.id, c.id));
  return j.access_token;
}

async function g<T>(token: string, url: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google API ${r.status}: ${url}`);
  return r.json() as Promise<T>;
}

// ---------- Drive ----------
const MIME: Record<string, string> = {
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.document": "Google Docs",
  "application/vnd.google-apps.spreadsheet": "Google Sheets",
  "application/pdf": "PDF",
};
export const FOLDER_SOURCE = "Drive folder";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const sourceOf = (mime: string) => (mime === FOLDER_MIME ? FOLDER_SOURCE : MIME[mime] ?? (mime.startsWith("video/") ? "Recording" : mime.startsWith("image/") ? "Image" : "Other"));

/** Folder links look like drive.google.com/drive/folders/<id> (sometimes with /u/0/ in the middle). */
export function driveFolderId(url: string) {
  return url.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1] ?? null;
}
export function driveFileId(url: string) {
  return driveFolderId(url) ?? url.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1] ?? url.match(/[?&]id=([A-Za-z0-9_-]{20,})/)?.[1] ?? null;
}
export async function driveMetadata(userId: string, url: string) {
  const id = driveFileId(url);
  if (!id) return null;
  const token = await googleAccessToken(userId);
  if (!token) return driveFolderId(url) ? { id, name: null, source: FOLDER_SOURCE } : null;
  const f = await g<{ id: string; name: string; mimeType: string }>(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`);
  return { id: f.id, name: f.name, source: sourceOf(f.mimeType) };
}

export type DriveItem = { id: string; name: string; source: string; isFolder: boolean; url: string; modifiedTime: string | null };

/** Everything directly inside a Drive folder, folders first. Read live with the viewer's own Google access. */
export async function driveFolderItems(userId: string, folderId: string): Promise<{ ok: true; items: DriveItem[] } | { ok: false; reason: "no_google" | "no_access" }> {
  const token = await googleAccessToken(userId);
  if (!token) return { ok: false, reason: "no_google" };
  const items: DriveItem[] = [];
  let pageToken = "";
  try {
    for (let i = 0; i < 5; i++) {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const r = await g<{ files: { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string }[]; nextPageToken?: string }>(token,
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)${pageToken ? `&pageToken=${pageToken}` : ""}`);
      for (const f of r.files) {
        const isFolder = f.mimeType === FOLDER_MIME;
        items.push({ id: f.id, name: f.name, source: sourceOf(f.mimeType), isFolder, modifiedTime: f.modifiedTime ?? null,
          url: f.webViewLink ?? (isFolder ? `https://drive.google.com/drive/folders/${f.id}` : `https://drive.google.com/file/d/${f.id}/view`) });
      }
      if (!r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
  } catch {
    return { ok: false, reason: "no_access" };
  }
  return { ok: true, items };
}
export function drivePreviewUrl(url: string) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

// ---------- Gmail ----------
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMsg = { id: string; threadId: string; internalDate: string; payload: GmailPart & { headers: { name: string; value: string }[] } };

function plainText(p: GmailPart): string {
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const part of p.parts ?? []) {
    const t = plainText(part);
    if (t) return t;
  }
  return "";
}
function stripQuoted(t: string) {
  const cut = t.search(/\n(On .+wrote:|-----Original Message-----|From: .+\nSent: )/);
  return (cut > 0 ? t.slice(0, cut) : t).trim();
}

/** Emails to/from any of the engagement's client domains since `since`. Read-only. */
export async function gmailItems(userId: string, domains: string[], since: Date): Promise<SourceItem[]> {
  if (!domains.length) return [];
  const token = await googleAccessToken(userId);
  if (!token) return [];
  const who = domains.map((d) => `from:${d} OR to:${d} OR cc:${d}`).join(" OR ");
  const q = `(${who}) after:${Math.floor(since.getTime() / 1000)}`;
  const list = await g<{ messages?: { id: string }[] }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`);
  const items: SourceItem[] = [];
  for (const { id } of list.messages ?? []) {
    const m = await g<GmailMsg>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    items.push({
      provider: "gmail", externalId: m.id, title: h("subject") || "(no subject)",
      url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
      occurredAt: new Date(Number(m.internalDate)).toISOString(),
      participants: [h("from"), h("to"), h("cc")].filter(Boolean),
      text: `From: ${h("from")}\nTo: ${h("to")}\nSubject: ${h("subject")}\n\n${stripQuoted(plainText(m.payload)).slice(0, 6000)}`,
    });
  }
  return items;
}

/** Also read emails between teammates that mention the client by name (e.g. internal threads about the deal). */
export async function gmailInternalMentions(userId: string, clientName: string, since: Date): Promise<SourceItem[]> {
  const token = await googleAccessToken(userId);
  if (!token) return [];
  const q = `"${clientName}" after:${Math.floor(since.getTime() / 1000)}`;
  const list = await g<{ messages?: { id: string }[] }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(q)}`);
  const items: SourceItem[] = [];
  for (const { id } of list.messages ?? []) {
    const m = await g<GmailMsg>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    if (/^Invitation:|^Accepted:|^Declined:/i.test(h("subject"))) continue; // calendar noise
    items.push({
      provider: "gmail", externalId: m.id, title: h("subject") || "(no subject)",
      url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
      occurredAt: new Date(Number(m.internalDate)).toISOString(),
      participants: [h("from"), h("to"), h("cc")].filter(Boolean),
      text: `From: ${h("from")}\nTo: ${h("to")}\nSubject: ${h("subject")}\n\n${stripQuoted(plainText(m.payload)).slice(0, 6000)}`,
    });
  }
  return items;
}
