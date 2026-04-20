"use client";

import { useState, useRef } from "react";
import { Upload, CheckCircle2, AlertCircle, Loader2, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadResult {
  success: boolean;
  inserted: number;
  skipped: number;
  message: string;
}

const ACCEPTED = ".csv,.xls,.xlsx,.pdf,.docx,.html,.htm,.txt,.ofx,.qfx";
const ACCEPTED_LABELS = ["CSV", "XLS", "XLSX", "PDF", "DOCX", "HTML", "TXT"];

export function UploadPanel({ userId }: { userId: string }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [file, setFile]         = useState<string | null>(null);
  const [result, setResult]     = useState<UploadResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ACCEPTED.split(",").includes(ext)) {
      setError(`Unsupported file type. Accepted: ${ACCEPTED_LABELS.join(", ")}`);
      return;
    }

    setFile(f.name);
    setLoading(true);
    setResult(null);
    setError(null);

    const form = new FormData();
    form.append("file", f);

    const res  = await fetch(`/api/upload?userId=${userId}`, { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      setFile(null);
    } else {
      setResult(data);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => !loading && fileRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 text-center transition-all bg-white",
          loading ? "cursor-wait" : "cursor-pointer",
          dragging
            ? "border-[#003d5c] bg-[#e6f0f6]"
            : "border-[#c8dde8] hover:border-[#003d5c] hover:bg-[#f7f9fc]"
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-[#e6f0f6] flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-[#003d5c] animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#003d5c]">Processing {file}</p>
              <p className="text-xs text-[#5c6b7a] mt-0.5">Extracting & categorising transactions…</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-[#fff6d1] flex items-center justify-center">
              <Upload className="w-5 h-5 text-[#8a6d00]" />
            </div>
            <div>
              <p className="text-sm text-[#0f1d2e]">
                Drop a file or{" "}
                <span className="text-[#003d5c] font-semibold underline underline-offset-2">browse</span>
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
                {ACCEPTED_LABELS.map((label) => (
                  <span
                    key={label}
                    className="text-[10px] font-semibold text-[#5c6b7a] bg-[#f7f9fc] border border-[#e4e9ef] rounded px-1.5 py-0.5"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#9aa4b0] mt-2">Max 10 MB</p>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="flex items-start gap-3 bg-[#e4f4ee] border border-[#c9e8dd] rounded-lg p-3.5">
          <CheckCircle2 className="w-4 h-4 text-[#0f766e] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#0f766e]">{result.message}</p>
            {result.skipped > 0 && (
              <p className="text-xs text-[#0f766e]/80 mt-0.5">{result.skipped} duplicates skipped</p>
            )}
          </div>
          <button onClick={reset} className="text-[#0f766e]/60 hover:text-[#0f766e] transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-[#fde8e8] border border-[#f5c7c7] rounded-lg p-3.5">
          <AlertCircle className="w-4 h-4 text-[#b91c1c] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#b91c1c]">Upload failed</p>
            <p className="text-xs text-[#b91c1c]/80 mt-0.5">{error}</p>
          </div>
          <button onClick={reset} className="text-[#b91c1c]/60 hover:text-[#b91c1c] transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {file && !loading && !result && !error && (
        <div className="flex items-center gap-3 bg-[#f7f9fc] border border-[#e4e9ef] rounded-lg px-3.5 py-2.5">
          <FileText className="w-4 h-4 text-[#5c6b7a] shrink-0" />
          <p className="text-sm text-[#0f1d2e] truncate flex-1">{file}</p>
        </div>
      )}
    </div>
  );
}
