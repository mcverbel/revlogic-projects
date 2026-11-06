import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import Google from "next-auth/providers/google";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, connections } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "rev-logic.com").split(",").map((d) => d.trim().toLowerCase());
const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      authorization: { params: { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent" } },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email || !profile?.email_verified) return false;
      return allowedDomains.includes(email.split("@")[1] ?? "");
    },
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const email = profile.email.toLowerCase();
        const [u] = await db
          .insert(users)
          .values({
            email,
            name: (profile.name as string) || email,
            avatarUrl: (profile.picture as string) ?? null,
            role: adminEmails.includes(email) ? "admin" : "member",
          })
          .onConflictDoUpdate({ target: users.email, set: { avatarUrl: (profile.picture as string) ?? null } })
          .returning();
        token.uid = u!.id;
        token.role = u!.role;

        // Store the Google token as this person's Gmail/Drive connection
        if (account.access_token) {
          const existing = await db.query.connections.findFirst({
            where: and(eq(connections.userId, u!.id), eq(connections.provider, "gmail")),
          });
          const values = {
            scope: "user", userId: u!.id, provider: "gmail", status: "active",
            encryptedToken: encrypt(account.access_token),
            encryptedRefreshToken: account.refresh_token ? encrypt(account.refresh_token) : existing?.encryptedRefreshToken ?? null,
            expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
          };
          if (existing) await db.update(connections).set(values).where(eq(connections.id, existing.id));
          else await db.insert(connections).values(values);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
