"use client";

import { useRef, useState } from "react";
import {
  Flame, Landmark, LineChart, Receipt, Shield, Home,
  Loader2, CheckCircle2, AlertCircle, X, ArrowRight, ArrowLeft, FileText, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = ".csv,.xls,.xlsx,.pdf,.docx,.html,.htm,.txt,.ofx,.qfx";

const CATEGORIES = [
  {
    key: "bank",
    icon: Landmark,
    color: "bg-[#e6f0f6] text-[#003d5c]",
    title: "Bank statements",
    desc: "Spending patterns, income, cash flow",
  },
  {
    key: "portfolio",
    icon: LineChart,
    color: "bg-[#efe5fb] text-[#6d28d9]",
    title: "Investment portfolio",
    desc: "CAS, mutual fund folios, stock holdings",
  },
  {
    key: "tax",
    icon: Receipt,
    color: "bg-[#e4f4ee] text-[#0f766e]",
    title: "Tax documents",
    desc: "Form 16, ITR, Form 26AS, 80C/80D proofs",
  },
  {
    key: "insurance",
    icon: Shield,
    color: "bg-[#fff6d1] text-[#8a6d00]",
    title: "Insurance policies",
    desc: "Term, health, life policy schedules",
  },
  {
    key: "loans",
    icon: Home,
    color: "bg-[#fde8e8] text-[#b91c1c]",
    title: "Loans & EMIs",
    desc: "Home, personal, car loan statements",
  },
] as const;

type UploadStatus = "uploading" | "success" | "error";

interface UploadedFile {
  id: string;
  name: string;
  status: UploadStatus;
  error?: string;
}

interface Props {
  userId: string;
  userName: string;
  onContinue: () => void;
  onBack?: () => void;
}

export function DocumentUploadPage({ userId, userName, onContinue, onBack }: Props) {
  const [uploads, setUploads] = useState<Record<string, UploadedFile[]>>({});
  const [clearing, setClearing] = useState(false);
  const categoryQueuesRef = useRef<Record<string, Promise<void>>>({});

  async function handleClearAll() {
    if (!confirm("Remove every uploaded document and transaction for this profile? This cannot be undone.")) return;
    setClearing(true);
    try {
      const res = await fetch(`/api/uploads/reset?userId=${userId}`, { method: "POST" });
      if (res.ok) {
        setUploads({});
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to clear uploads");
      }
    } finally {
      setClearing(false);
    }
  }

  async function handleFiles(categoryKey: string, files: FileList | null) {
    if (!files || files.length === 0) return;

    const newEntries = Array.from(files).map((file) => ({
      entry: { id: crypto.randomUUID(), name: file.name, status: "uploading" as UploadStatus },
      file,
    }));

    setUploads((prev) => ({
      ...prev,
      [categoryKey]: [...(prev[categoryKey] ?? []), ...newEntries.map((e) => e.entry)],
    }));

    const processBatch = async () => {
      for (const { entry, file } of newEntries) {
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(`/api/upload?userId=${userId}&category=${categoryKey}`, { method: "POST", body: form });
          const data = await res.json();
          setUploads((prev) => {
            const list = prev[categoryKey] ?? [];
            return {
              ...prev,
              [categoryKey]: list.map((f) =>
                f.id === entry.id
                  ? { ...f, status: res.ok ? "success" : "error", error: res.ok ? undefined : data.error }
                  : f
              ),
            };
          });
        } catch (err) {
          setUploads((prev) => {
            const list = prev[categoryKey] ?? [];
            return {
              ...prev,
              [categoryKey]: list.map((f) =>
                f.id === entry.id
                  ? { ...f, status: "error" as const, error: err instanceof Error ? err.message : "Upload failed" }
                  : f
              ),
            };
          });
        }
      }
    };

    const previous = categoryQueuesRef.current[categoryKey] ?? Promise.resolve();
    categoryQueuesRef.current[categoryKey] = previous
      .catch(() => undefined)
      .then(processBatch);
  }

  function removeFile(categoryKey: string, fileId: string) {
    setUploads((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] ?? []).filter((f) => f.id !== fileId),
    }));
  }

  const totalUploaded = Object.values(uploads).flat().filter((f) => f.status === "success").length;

  return (
    <div className="min-h-screen bg-[#f7f9fc] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-[#e4e9ef] shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back to profile"
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#d1d9e0] text-[#003d5c] hover:bg-[#f7f9fc] hover:border-[#003d5c] transition-all"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2.25} />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#003d5c] flex items-center justify-center">
                <Flame className="w-4 h-4 text-[#ffcd00]" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#003d5c] leading-tight tracking-tight">FIRE</p>
                <p className="text-[11px] text-[#5c6b7a] leading-tight mt-0.5">Financial Intelligence Engine</p>
              </div>
            </div>
          </div>
          <p className="text-xs font-semibold text-[#5c6b7a] uppercase tracking-wide">Step 2 of 2</p>
        </div>
        <div className="h-1 bg-[#e4e9ef]">
          <div className="h-full w-full bg-[#ffcd00]" />
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-[#003d5c] tracking-tight">
                Upload your financial documents
              </h1>
              <p className="text-[15px] text-[#5c6b7a] mt-2 leading-relaxed max-w-xl">
                The more FIRE knows, {userName.split(" ")[0] || "the better"}, the sharper its advice.
                All optional — you can add documents later from the chat.
              </p>
            </div>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-[#b91c1c] hover:bg-[#fde8e8] border border-[#f5c7c7] rounded-md px-3 py-2 transition-colors disabled:opacity-50"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear all data
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.key}
                category={cat}
                files={uploads[cat.key] ?? []}
                onFiles={(files) => handleFiles(cat.key, files)}
                onRemove={(id) => removeFile(cat.key, id)}
              />
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-[#e4e9ef] shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[#5c6b7a]">
            {totalUploaded === 0 ? (
              "No documents uploaded yet"
            ) : (
              <>
                <span className="font-semibold text-[#0f766e]">{totalUploaded}</span> file
                {totalUploaded === 1 ? "" : "s"} ready
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onContinue}
              className="text-sm font-semibold text-[#5c6b7a] hover:text-[#003d5c] transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={onContinue}
              className="flex items-center gap-2 bg-[#ffcd00] hover:bg-[#e5b800] text-[#003d5c] text-sm font-bold rounded-lg px-5 py-2.5 transition-all"
            >
              Continue to chat
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CategoryCard({
  category,
  files,
  onFiles,
  onRemove,
}: {
  category: (typeof CATEGORIES)[number];
  files: UploadedFile[];
  onFiles: (files: FileList) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(
        "bg-white border rounded-xl p-5 transition-all",
        dragging ? "border-[#003d5c] bg-[#e6f0f6]" : "border-[#e4e9ef]"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", category.color)}>
          <category.icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#003d5c] text-sm">{category.title}</p>
          <p className="text-xs text-[#5c6b7a] mt-0.5 leading-relaxed">{category.desc}</p>
        </div>
      </div>

      {files.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full text-xs font-semibold border-2 border-dashed border-[#d1d9e0] hover:border-[#003d5c] bg-white hover:bg-[#f7f9fc] rounded-lg py-3 text-[#5c6b7a] hover:text-[#003d5c] transition-all"
        >
          + Upload or drop files
        </button>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onRemove={() => onRemove(f.id)} />
          ))}
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-[#003d5c] font-semibold hover:underline mt-2"
          >
            + Add more
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function FileRow({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 border text-xs",
        file.status === "success" && "bg-[#e4f4ee] border-[#c9e8dd]",
        file.status === "error"   && "bg-[#fde8e8] border-[#f5c7c7]",
        file.status === "uploading" && "bg-[#f7f9fc] border-[#e4e9ef]"
      )}
    >
      {file.status === "uploading" && <Loader2 className="w-3.5 h-3.5 text-[#003d5c] animate-spin shrink-0" />}
      {file.status === "success"   && <CheckCircle2 className="w-3.5 h-3.5 text-[#0f766e] shrink-0" />}
      {file.status === "error"     && <AlertCircle className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />}
      {file.status === "uploading" ? null : <FileText className="w-3.5 h-3.5 text-[#5c6b7a] shrink-0 hidden" />}

      <span
        className={cn(
          "flex-1 truncate font-medium",
          file.status === "success" && "text-[#0f766e]",
          file.status === "error"   && "text-[#b91c1c]",
          file.status === "uploading" && "text-[#0f1d2e]"
        )}
        title={file.error ?? file.name}
      >
        {file.name}
      </span>

      <button onClick={onRemove} className="text-current opacity-50 hover:opacity-100 transition-opacity shrink-0">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
