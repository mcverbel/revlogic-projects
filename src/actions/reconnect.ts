"use server";
import { signIn } from "@/auth";
export async function signInAgain() {
  await signIn("google", { redirectTo: "/connections" });
}
