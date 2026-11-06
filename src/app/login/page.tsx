import { signIn } from "@/auth";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-[0.24em]">revlogic</span>
          <span className="label-mono">Projects</span>
        </div>
        <p className="text-ink-2 leading-relaxed">Sign in with your revlogic Google account. You&apos;ll be asked to allow read-only Gmail and Drive access so the app can suggest tasks and preview documents.</p>
        <LoginError searchParams={searchParams} />
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
          <button className="btn btn-primary w-full justify-center min-h-11">Continue with Google</button>
        </form>
      </div>
    </main>
  );
}

async function LoginError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return <p className="text-red text-sm">Only @rev-logic.com accounts can sign in.</p>;
}
