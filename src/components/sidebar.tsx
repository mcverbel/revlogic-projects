"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, Avatar } from "./ui";
import { journeyLabel, isPursuit } from "@/lib/constants";
import { signOutAction } from "@/actions/auth";

type Eng = { id: string; slug: string; name: string; client: string; stage: string; mine: boolean };

function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3.5 min-h-11 px-3.5 rounded-[10px] no-underline text-[15px] ${active ? "bg-side-active text-[#f2f3f2] shadow-[inset_3px_0_0_#7fdcae]" : "text-[#e6e8e7] hover:bg-[#384140]"}`}>
      <Icon name={icon} size={21} color={active ? "#7fdcae" : "#c9cdcb"} />{label}
    </Link>
  );
}

function Group({ title, icon, items, badgeMint, pathname }: { title: string; icon: string; items: Eng[]; badgeMint: boolean; pathname: string }) {
  const [open, setOpen] = useState(true);
  const activeHere = items.some((e) => pathname.startsWith(`/e/${e.slug}`));
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={`flex items-center gap-3.5 min-h-11 px-3.5 rounded-[10px] text-[15px] text-left w-full cursor-pointer ${activeHere && badgeMint ? "bg-side-active shadow-[inset_3px_0_0_#7fdcae] text-[#f2f3f2]" : "text-[#e6e8e7] hover:bg-[#384140]"}`}>
        <Icon name={icon} size={21} color={activeHere && badgeMint ? "#7fdcae" : "#c9cdcb"} />
        <span className="flex-1">{title}</span>
        <Icon name="chevron" size={16} color="#c9cdcb" className={open ? "" : "-rotate-90"} />
        <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-semibold inline-flex items-center justify-center ${badgeMint ? "bg-mint text-mint-ink" : "bg-[#4a504e] text-[#e6e8e7]"}`}>{items.length}</span>
      </button>
      {open && items.map((e) => {
        const active = pathname.startsWith(`/e/${e.slug}`);
        return (
          <Link key={e.id} href={`/e/${e.slug}`} className={`flex items-center gap-3 min-h-12 py-1.5 pr-3.5 pl-[50px] rounded-[10px] no-underline text-[#e6e8e7] ${active ? "bg-[#424746]" : "hover:bg-[#384140]"}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isPursuit(e.stage) ? "#e0a54b" : "#7fdcae" }} />
            <span className="flex flex-col min-w-0">
              <span className="truncate">{e.client}</span>
              <span className="text-xs text-[#a9aeac] truncate">{e.name} · {journeyLabel(e.stage).replace(/^Stage (\d) - .*/, "Stage $1")}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ me, engagements }: { me: { name: string; email: string; avatarUrl: string | null; role: string }; engagements: Eng[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="bg-side border-r border-[#3a403e] box-border px-4 pt-7 pb-5 flex flex-col gap-1.5 max-w-full" style={{ flex: "1 1 272px" }}>
      <Link href="/" className="flex flex-col items-start gap-2 px-3 pb-5 no-underline">
        <span style={{ fontFamily: "var(--font-display)" }} className="text-[27px] font-light tracking-[0.24em] leading-none text-[#f2f3f2]">revlogic</span>
        <span className="text-[13px] text-[#b5bab8] tracking-[0.16em] font-mono">PROJECTS</span>
      </Link>
      <NavLink href="/" icon="home" label="My Work" active={pathname === "/"} />
      <NavLink href="/team" icon="team" label="Team" active={pathname.startsWith("/team")} />

      <div className="label-mono px-3.5 pt-5 pb-2">Engagements</div>
      <Group title="Assigned to Me" icon="briefcase" items={engagements.filter((e) => e.mine)} badgeMint pathname={pathname} />
      <Group title="All revlogic" icon="building" items={engagements} badgeMint={false} pathname={pathname} />
      <Link href="/engagements/new" className="flex items-center gap-3.5 min-h-11 mt-1.5 px-3.5 rounded-[10px] border border-dashed border-[#4f5553] text-[#c9cdcb] text-sm no-underline hover:bg-[#384140]">
        <Icon name="plus" size={21} color="#c9cdcb" />New engagement
      </Link>

      <div className="label-mono px-3.5 pt-5 pb-2">System</div>
      <NavLink href="/connections" icon="plug" label="Connections" active={pathname.startsWith("/connections")} />

      <div className="mt-auto pt-6 px-3.5 flex items-center gap-2.5">
        <Avatar name={me.name} src={me.avatarUrl} size={30} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm truncate">{me.name}</span>
          <span className="text-xs text-[#a9aeac] truncate">{me.role === "admin" ? "Admin" : "Member"}</span>
        </div>
        <form action={signOutAction}><button aria-label="Sign out" className="btn btn-quiet px-2"><Icon name="logout" size={18} /></button></form>
      </div>
    </nav>
  );
}
