"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SessionUser = { id: string; email?: string | null };

type ContentItem = {
  id: string;
  title: string;
  notes: string;
  content_type: string;
  stage: string;
  tags: string[];
  created_at: string;
};

const TYPES = ["General", "Podcast", "YouTube", "TikTok", "Instagram", "Blog", "Newsletter", "Stream"];
const STAGES = ["Idea", "Draft", "Script", "Recorded", "Edited", "Posted", "Repurposed"];

function hookFor(title: string, type: string) {
  const pools: Record<string, string[]> = {
    Podcast: [
      `Hot take: ${title}.`,
      `I’m about to ruin your comfort with this: ${title}.`,
      `If you’ve been avoiding this topic, that’s why we’re doing it: ${title}.`,
    ],
    YouTube: [
      `Stop doing this right now: ${title}.`,
      `I tested it so you don’t have to: ${title}.`,
      `Most people get this wrong: ${title}.`,
    ],
    TikTok: [
      `Nobody tells you this: ${title}.`,
      `Here’s the hack: ${title}.`,
      `If you do this, you’re playing yourself: ${title}.`,
    ],
    Instagram: [
      `Save this: ${title}.`,
      `A reminder you didn’t ask for: ${title}.`,
      `This is your sign: ${title}.`,
    ],
    Blog: [
      `The real problem behind ${title}`,
      `${title}: a practical breakdown`,
      `What changed when I finally understood ${title}`,
    ],
    Newsletter: [
      `This week’s lesson: ${title}.`,
      `One thing I can’t unlearn: ${title}.`,
      `If you only read one thing today: ${title}.`,
    ],
    Stream: [
      `Chat, we need to talk about ${title}.`,
      `Let’s break down ${title} live.`,
      `I’ve got thoughts on ${title}.`,
    ],
    General: [
      `Let’s talk about ${title}.`,
      `Here’s the truth: ${title}.`,
      `${title}, but the real version.`,
    ],
  };

  const pool = pools[type] ?? pools.General;
  return pool[Math.floor(Math.random() * pool.length)];
}

function repurposeAngles(title: string) {
  return [
    `Myth vs Fact: ${title}`,
    `3 mistakes people make with ${title}`,
    `The checklist for ${title}`,
    `What nobody mentions about ${title}`,
    `A quick story about ${title}`,
    `If you’re stuck, try this: ${title}`,
    `Unpopular opinion: ${title}`,
    `Beginner guide: ${title}`,
    `Advanced take: ${title}`,
    `One sentence that fixes ${title}`,
  ];
}

export default function Page() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState<string>("");

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [q, setQ] = useState("");

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [contentType, setContentType] = useState("General");
  const [stage, setStage] = useState("Idea");
  const [tags, setTags] = useState("");

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((i) => {
      const blob = `${i.title} ${i.notes} ${i.content_type} ${i.stage} ${(i.tags || []).join(" ")}`.toLowerCase();
      return blob.includes(query);
    });
  }, [items, q]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (mounted) setUser(u ? { id: u.id, email: u.email } : null);

      supabase.auth.onAuthStateChange((_event, session) => {
        const uu = session?.user;
        setUser(uu ? { id: uu.id, email: uu.email } : null);
      });

      setLoading(false);
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setWorkspaceId(null);
      setItems([]);
      return;
    }
    (async () => {
      const wsId = await ensureWorkspace(user.id, user.email ?? "Creator");
      setWorkspaceId(wsId);
      await refreshItems(wsId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function ensureWorkspace(userId: string, label: string) {
    const { data: existing, error: exErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1);

    if (exErr) throw exErr;

    if (existing && existing.length > 0) {
      const wsId = existing[0].id as string;
      await supabase.from("workspace_members").upsert({ workspace_id: wsId, user_id: userId, role: "owner" });
      return wsId;
    }

    const name = `${label.split("@")[0] || "Creator"}'s Workspace`;
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({ name, owner_id: userId })
      .select("id")
      .single();

    if (wsErr) throw wsErr;

    await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
    return ws.id as string;
  }

  async function refreshItems(wsId: string) {
    const { data, error } = await supabase
      .from("content_items")
      .select("id,title,notes,content_type,stage,tags,created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setItems((data as ContentItem[]) ?? []);
  }

  async function signIn() {
    setAuthMsg("");
    const clean = email.trim();
    if (!clean) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });

    if (error) setAuthMsg(error.message);
    else setAuthMsg("Check your email for the login link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function clearForm() {
    setTitle("");
    setNotes("");
    setTags("");
    setContentType("General");
    setStage("Idea");
    setEditingId(null);
  }

  async function addOrUpdate() {
    if (!workspaceId) return;
    const t = title.trim();
    if (!t) return;

    const tagArr = tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!editingId) {
      const { error } = await supabase.from("content_items").insert({
        workspace_id: workspaceId,
        title: t,
        notes: notes.trim(),
        content_type: contentType,
        stage,
        tags: tagArr,
      });

      if (error) return alert(error.message);
    } else {
      const { error } = await supabase
        .from("content_items")
        .update({
          title: t,
          notes: notes.trim(),
          content_type: contentType,
          stage,
          tags: tagArr,
        })
        .eq("id", editingId);

      if (error) return alert(error.message);
    }

    clearForm();
    await refreshItems(workspaceId);
  }

  async function delItem(id: string) {
    if (!workspaceId) return;
    const { error } = await supabase.from("content_items").delete().eq("id", id);
    if (error) return alert(error.message);
    await refreshItems(workspaceId);
  }

  function startEdit(i: ContentItem) {
    setEditingId(i.id);
    setTitle(i.title);
    setNotes(i.notes ?? "");
    setContentType(i.content_type ?? "General");
    setStage(i.stage ?? "Idea");
    setTags((i.tags ?? []).join(", "));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied ✅");
    } catch {
      alert("Clipboard blocked by browser permissions.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Creator Grenade v1 💣</h1>
            <p className="text-zinc-400 text-sm">Cloud-synced content library for any creator.</p>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-xs text-zinc-400">{user.email}</span>
                <button
                  onClick={signOut}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>

        {!user ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="font-semibold">Sign in</h2>
            <p className="text-sm text-zinc-400 mt-1">We’ll email you a magic link. No password.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
              <button
                onClick={signIn}
                className="rounded-xl bg-white text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-zinc-200"
              >
                Send link
              </button>
            </div>
            {authMsg ? <p className="mt-3 text-sm text-zinc-300">{authMsg}</p> : null}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{editingId ? "Edit content" : "Add content"}</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {editingId ? "Update it, then save." : "Add an idea, a draft, a script, anything."}
                    </p>
                  </div>
                  {editingId ? (
                    <button
                      onClick={clearForm}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title (e.g., 10 hooks for procrastination)"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes / script fragments / outline…"
                    className="w-full min-h-[110px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={contentType}
                      onChange={(e) => setContentType(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Tags (comma separated): mindset, hooks, growth"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />

                  <button
                    onClick={addOrUpdate}
                    className="mt-1 rounded-xl bg-white text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-zinc-200"
                  >
                    {editingId ? "Save changes" : "Add"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Library</h2>
                  <span className="text-xs text-zinc-400">{items.length} items</span>
                </div>

                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="mt-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />

                <p className="mt-4 text-xs text-zinc-400">
                  v1 includes: edit, repurpose angles, and hook generator (local). Next: AI.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {filtered.map((i) => {
                const hook = hookFor(i.title, i.content_type);
                const angles = repurposeAngles(i.title);

                return (
                  <div key={i.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-lg font-semibold">{i.title}</div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {i.content_type} • {i.stage} • {new Date(i.created_at).toLocaleString()}
                        </div>

                        {i.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {i.tags.map((t) => (
                              <span key={t} className="text-xs rounded-full border border-zinc-800 px-2 py-1 text-zinc-300">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {i.notes ? <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-200">{i.notes}</p> : null}

                        <div className="mt-4 grid gap-2">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <div className="text-xs text-zinc-400">Hook</div>
                            <div className="mt-1 text-sm">{hook}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => copy(hook)}
                                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                              >
                                Copy hook
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <div className="text-xs text-zinc-400">Repurpose angles (10)</div>
                            <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                              {angles.map((a) => (
                                <li key={a}>{a}</li>
                              ))}
                            </ul>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => copy(angles.join("\n"))}
                                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                              >
                                Copy angles
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(i)}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => delItem(i.id)}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:bg-zinc-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 ? (
                <div className="text-sm text-zinc-400 mt-4">No items yet. Add your first one and light the fuse.</div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}