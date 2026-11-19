"use client";

import { useState, useTransition } from "react";
import type { FullTask } from "@/lib/queries";
import { MentionBox, CommentBody } from "./mention-box";
import { Avatar } from "./ui";
import { addComment, updateComment, deleteComment } from "@/actions/tasks";
import { fmtDate } from "@/lib/format";
import type { PickPerson } from "./person-picker";

export type Viewer = { id: string; role: string };

/** Comments on a task: links, @tags, and edit / delete on your own comments. */
export function TaskComments({ task: t, people, me, onDeleteTask }: {
  task: FullTask; people: PickPerson[]; me: Viewer; onDeleteTask: () => void;
}) {
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; body: string; mentionIds: string[] } | null>(null);
  const person = (id: string) => people.find((p) => p.id === id);
  const send = () => { if (comment.trim()) start(async () => { await addComment(t.id, comment, mentionIds); setComment(""); setMentionIds([]); }); };
  const saveEdit = () => { if (editing?.body.trim()) start(async () => { await updateComment(editing.id, editing.body, editing.mentionIds); setEditing(null); }); };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <span className="text-xs font-semibold text-ink-3">Comments</span>
      {t.comments.length === 0 && <span className="text-[13px] text-ink-3">No comments yet.</span>}
      {t.comments.map((c) => {
        const a = person(c.authorId);
        const mine = c.authorId === me.id || me.role === "admin";
        const isEditing = editing?.id === c.id;
        return (
          <div key={c.id} className="flex gap-2.5 group">
            <Avatar name={a?.name ?? "?"} src={a?.avatarUrl} size={28} />
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold">{a?.name}</span>
                <span className="text-xs text-ink-3">{fmtDate(c.createdAt)}</span>
                {mine && !isEditing && (
                  <span className="ml-auto flex gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                    <button type="button" className="text-xs text-ink-3 hover:text-ink px-1.5 py-0.5 rounded cursor-pointer"
                      onClick={() => setEditing({ id: c.id, body: c.body, mentionIds: c.mentions })}>Edit</button>
                    <button type="button" className="text-xs text-ink-3 hover:text-red px-1.5 py-0.5 rounded cursor-pointer" disabled={pending}
                      onClick={() => confirm("Delete this comment?") && start(() => deleteComment(c.id))}>Delete</button>
                  </span>
                )}
              </span>
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <MentionBox people={people} value={editing.body} autoFocus rows={3} placeholder="Edit your comment"
                    onChange={(body) => setEditing({ ...editing, body })} mentionIds={editing.mentionIds}
                    onMentionIds={(ids) => setEditing({ ...editing, mentionIds: ids })} onSubmit={saveEdit} />
                  <span className="flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost min-h-8 px-3" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary min-h-8 px-3" disabled={!editing.body.trim() || pending} onClick={saveEdit}>Save</button>
                  </span>
                </div>
              ) : (
                <span className="text-[14px] leading-relaxed whitespace-pre-wrap break-words"><CommentBody body={c.body} people={people} /></span>
              )}
            </div>
          </div>
        );
      })}
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="comment" className="text-xs text-ink-3">Add a comment. Anyone you @tag gets a Slack DM.</label>
        <MentionBox id="comment" people={people} value={comment} onChange={setComment} mentionIds={mentionIds} onMentionIds={setMentionIds} onSubmit={send} />
        <div className="flex justify-between">
          <button type="button" className="btn btn-quiet hover:text-red" onClick={onDeleteTask}>Delete task</button>
          <button className="btn btn-primary" disabled={!comment.trim() || pending}>Comment</button>
        </div>
      </form>
    </div>
  );
}
