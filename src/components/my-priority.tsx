"use client";
import { useTransition } from "react";
import { setMyPriority } from "@/actions/tasks";
import { MY_PRIORITIES } from "@/lib/constants";

export function MyPrioritySelect({ taskId, value }: { taskId: string; value: string }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label="My priority" className="field min-h-8 text-[13px]" defaultValue={value} disabled={pending}
      onChange={(e) => start(() => setMyPriority(taskId, e.target.value))}>
      {MY_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}
