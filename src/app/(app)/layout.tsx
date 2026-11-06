import { requireUser } from "@/lib/session";
import { sidebarEngagements } from "@/lib/queries";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const engs = await sidebarEngagements(me.id);
  return (
    <div className="flex flex-wrap min-h-screen">
      <Sidebar me={{ name: me.name, email: me.email, avatarUrl: me.avatarUrl, role: me.role }} engagements={engs} />
      <main className="min-w-0 box-border px-8 pt-6 pb-14 flex flex-col gap-5" style={{ flex: "999 1 560px" }}>{children}</main>
    </div>
  );
}
