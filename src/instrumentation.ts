// Runs once when a server instance starts (Next.js instrumentation hook).
// The import sits inside the NEXT_RUNTIME check so it's left out of the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSchema } = await import("./lib/ensure-schema");
      if (process.env.DATABASE_URL) await ensureSchema();
    } catch (err) {
      console.error("ensureSchema failed", err);
    }
  }
}
