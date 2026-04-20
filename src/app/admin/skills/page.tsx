"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

type SkillListItem = {
  key: string;
  label: string;
  preview: string;
};

type SkillRevision = {
  id: string;
  skillName: string;
  content: string;
  summary: string | null;
  editor: string | null;
  createdAt: string;
};

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [editor, setEditor] = useState("local-admin");
  const [revisions, setRevisions] = useState<SkillRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function loadSkillList() {
    const res = await fetch("/api/admin/skills");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load skills");
    setSkills(data.skills);
    if (data.skills.length > 0) {
      setSelectedKey((prev) => prev || data.skills[0].key);
    }
  }

  async function loadSkillDetail(skillKey: string) {
    const res = await fetch(`/api/admin/skills?skillKey=${skillKey}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load skill details");
    setContent(data.skill.content);
    setRevisions(data.revisions);
  }

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        await loadSkillList();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    const run = async () => {
      try {
        setLoading(true);
        await loadSkillDetail(selectedKey);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load skill");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [selectedKey]);

  async function saveSkill() {
    if (!selectedKey) return;
    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/admin/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skillKey: selectedKey,
        content,
        summary: summary.trim() || undefined,
        editor: editor.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setStatus(data.error ?? "Failed to save");
      return;
    }

    setSummary("");
    setStatus("Saved successfully.");
    await loadSkillDetail(selectedKey);
    await loadSkillList();
  }

  const selectedLabel = useMemo(
    () => skills.find((item) => item.key === selectedKey)?.label ?? "Skill",
    [skills, selectedKey]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold">Agent Skills Admin</h1>
          <p className="text-sm text-white/50">
            Edit markdown prompt skills and keep revision history.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 md:col-span-3 border border-white/10 rounded-xl p-3 bg-white/5">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Skills</p>
            <div className="space-y-2">
              {skills.map((skill) => (
                <button
                  key={skill.key}
                  onClick={() => setSelectedKey(skill.key)}
                  className={`w-full text-left rounded-lg p-2 border transition ${
                    selectedKey === skill.key
                      ? "border-blue-500/50 bg-blue-900/30"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <p className="text-sm font-medium">{skill.label}</p>
                  <p className="text-xs text-white/45">{skill.preview}</p>
                </button>
              ))}
            </div>
          </aside>

          <main className="col-span-12 md:col-span-6 border border-white/10 rounded-xl p-4 bg-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{selectedLabel}</p>
              {loading && <p className="text-xs text-white/50">Loading...</p>}
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[420px] bg-black/30 border border-white/10 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-blue-500/60"
            />

            <div className="space-y-2">
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Revision summary (optional)"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60"
              />
              <input
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
                placeholder="Editor name"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void saveSkill()}
                disabled={saving || !selectedKey}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? "Saving..." : "Save Skill"}
              </button>
              {status && <p className="text-xs text-white/60">{status}</p>}
            </div>
          </main>

          <section className="col-span-12 md:col-span-3 border border-white/10 rounded-xl p-3 bg-white/5">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Revision History</p>
            <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
              {revisions.map((rev) => (
                <div key={rev.id} className="border border-white/10 rounded-lg p-2 bg-black/20">
                  <p className="text-xs text-white/70">
                    {formatDate(rev.createdAt)} · {new Date(rev.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-white/45">{rev.editor ?? "unknown editor"}</p>
                  {rev.summary && <p className="text-xs mt-1 text-white/70">{rev.summary}</p>}
                  <button
                    onClick={() => setContent(rev.content)}
                    className="mt-2 text-xs text-blue-300 hover:text-blue-200"
                  >
                    Load this revision
                  </button>
                </div>
              ))}
              {revisions.length === 0 && (
                <p className="text-xs text-white/40">No revisions yet for this skill.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
