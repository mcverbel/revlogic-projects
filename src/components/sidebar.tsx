"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, Avatar } from "./ui";
import { journeyLabel, isPursuit, SECTIONS, categoryOf } from "@/lib/constants";
import { signOutAction } from "@/actions/auth";

type Eng = { id: string; slug: string; name: string; client: string; stage: string; mine: boolean; category: string };

function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3.5 min-h-11 px-3.5 rounded-[10px] no-underline text-[15px] ${active ? "bg-side-active text-[#f2f3f2] shadow-[inset_3px_0_0_#7fdcae]" : "text-[#e6e8e7] hover:bg-[#384140]"}`}>
      <Icon name={icon} size={21} color={active ? "#7fdcae" : "#c9cdcb"} />{label}
    </Link>
  );
}

function Group({ title, icon, items, badgeMint, pathname, startOpen = true, showStage = true }: { title: string; icon: string; items: Eng[]; badgeMint: boolean; pathname: string; startOpen?: boolean; showStage?: boolean }) {
  const [open, setOpen] = useState(startOpen || items.some((e) => pathname.startsWith(`/e/${e.slug}`)));
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
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: showStage && isPursuit(e.stage) ? "#e0a54b" : "#7fdcae" }} />
            <span className="flex flex-col min-w-0">
              <span className="truncate">{e.client}</span>
              <span className="text-xs text-[#a9aeac] truncate">{e.name}{showStage ? ` · ${journeyLabel(e.stage).replace(/^Stage (\d) - .*/, "Stage $1")}` : ""}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** A Creative bucket: the title opens its task board; the chevron shows other projects filed under it. */
function Bucket({ label, icon, href, boardSlug, items, pathname }: { label: string; icon: string; href: string; boardSlug: string; items: Eng[]; pathname: string }) {
  const projects = items.filter((e) => e.slug !== boardSlug);
  const onBoard = pathname.startsWith(`/e/${boardSlug}`);
  const [open, setOpen] = useState(projects.some((e) => pathname.startsWith(`/e/${e.slug}`)));
  return (
    <div className="flex flex-col gap-0.5">
      <div className={`flex items-center rounded-[10px] ${onBoard ? "bg-side-active shadow-[inset_3px_0_0_#7fdcae]" : "hover:bg-[#384140]"}`}>
        <Link href={href} aria-current={onBoard ? "page" : undefined} className={`flex flex-1 items-center gap-3.5 min-h-11 pl-3.5 no-underline text-[15px] ${onBoard ? "text-[#f2f3f2]" : "text-[#e6e8e7]"}`}>
          <Icon name={icon} size={21} color={onBoard ? "#7fdcae" : "#c9cdcb"} />{label}
        </Link>
        {projects.length > 0 && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${label} projects`}
            className="flex items-center gap-2 min-h-11 px-3.5 cursor-pointer">
            <Icon name="chevron" size={16} color="#c9cdcb" className={open ? "" : "-rotate-90"} />
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-semibold inline-flex items-center justify-center bg-[#4a504e] text-[#e6e8e7]">{projects.length}</span>
          </button>
        )}
      </div>
      {open && projects.map((e) => {
        const active = pathname.startsWith(`/e/${e.slug}`);
        return (
          <Link key={e.id} href={`/e/${e.slug}`} className={`flex items-center gap-3 min-h-12 py-1.5 pr-3.5 pl-[50px] rounded-[10px] no-underline text-[#e6e8e7] ${active ? "bg-[#424746]" : "hover:bg-[#384140]"}`}>
            <span className="w-2 h-2 rounded-full shrink-0 bg-mint-2" />
            <span className="flex flex-col min-w-0"><span className="truncate">{e.client}</span><span className="text-xs text-[#a9aeac] truncate">{e.name}</span></span>
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

      {SECTIONS.map((sec) => {
        const inSection = engagements.filter((e) => categoryOf(e.category).section === sec.id);
        const isEng = sec.id === "engagement";
        const newLink = (category: string, label: string) => (
          <Link href={`/engagements/new?category=${category}`} className="flex items-center gap-3.5 min-h-10 mt-1 px-3.5 rounded-[10px] border border-dashed border-[#4f5553] text-[#c9cdcb] text-sm no-underline hover:bg-[#384140]">
            <Icon name="plus" size={19} color="#c9cdcb" />{label}
          </Link>
        );
        return (
          <div key={sec.id} className="flex flex-col gap-0.5">
            <div className="label-mono px-3.5 pt-5 pb-2">{sec.label}</div>
            {"buckets" in sec ? (
              <>
                {sec.buckets.map((b) => (
                  <Bucket key={b.id} label={b.label} icon={b.icon} href={b.href} boardSlug={b.boardSlug} items={inSection.filter((e) => categoryOf(e.category).id === b.id)} pathname={pathname} />
                ))}
                {newLink("creative_design", "New creative project")}
              </>
            ) : (
              <>
                <Group title="Assigned to Me" icon="briefcase" items={inSection.filter((e) => e.mine)} badgeMint pathname={pathname} startOpen={isEng} showStage={isEng} />
                <Group title="All revlogic" icon="building" items={inSection} badgeMint={false} pathname={pathname} startOpen={isEng} showStage={isEng} />
                {newLink(sec.id, isEng ? "New engagement" : "New partner")}
              </>
            )}
          </div>
        );
      })}

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
