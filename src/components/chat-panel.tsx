"use client";

import { useState, useRef, useEffect } from "react";
import { UploadPanel } from "@/components/upload-panel";
import { cn } from "@/lib/utils";
import {
  Loader2, Flame, Paperclip, X, ArrowUp, ChevronRight, ArrowLeft,
  LayoutDashboard, PieChart, TrendingDown, FileText, Lightbulb,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

const QUICK_PROMPTS = [
  { icon: LayoutDashboard, text: "Give me a daily briefing on my financial health", color: "bg-[#e6f0f6] text-[#003d5c]" },
  { icon: PieChart,        text: "How is my portfolio allocated and what should I rebalance?", color: "bg-[#fff6d1] text-[#8a6d00]" },
  { icon: TrendingDown,    text: "What are my biggest spending leaks this month?", color: "bg-[#fde8e8] text-[#b91c1c]" },
  { icon: FileText,        text: "What tax deductions am I missing this financial year?", color: "bg-[#e4f4ee] text-[#0f766e]" },
  { icon: Lightbulb,       text: "Show me 1-2 speculative ideas worth researching", color: "bg-[#efe5fb] text-[#6d28d9]" },
];

function AssistantMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-[15px] text-[#0f1d2e] leading-relaxed mb-3 last:mb-0">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[#003d5c]">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-[#2d3f52]">{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-5 space-y-1.5 mb-3">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-5 space-y-1.5 mb-3">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-[15px] text-[#0f1d2e] leading-relaxed pl-1 marker:text-[#003d5c]">{children}</li>
        ),
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-[#003d5c] mb-2 mt-5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold text-[#003d5c] mb-2 mt-4 first:mt-0 pb-2 border-b-2 border-[#ffcd00]">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[15px] font-semibold text-[#0f1d2e] mb-1.5 mt-3 first:mt-0">{children}</h3>
        ),
        pre: ({ children }) => (
          <pre className="bg-[#f7f9fc] border border-[#e4e9ef] rounded-lg p-4 overflow-x-auto mb-3 text-xs font-mono text-[#0f1d2e] leading-relaxed">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="bg-[#e6f0f6] text-[#003d5c] border border-[#c8dde8] px-1.5 py-0.5 rounded text-xs font-mono">
            {children}
          </code>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-[#ffcd00] bg-[#fffbeb] pl-4 pr-3 py-2 text-[#2d3f52] italic mb-3 rounded-r-md">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-[#e4e9ef] my-4" />,
        a: ({ children, href }) => (
          <a href={href} className="text-[#0078a8] hover:text-[#003d5c] underline underline-offset-2 font-medium transition-colors" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3 rounded-lg border border-[#e4e9ef]">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-[#f7f9fc] border-b border-[#e4e9ef]">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="text-left text-xs font-semibold text-[#003d5c] uppercase tracking-wide px-4 py-2.5">{children}</th>
        ),
        td: ({ children }) => (
          <td className="text-[#0f1d2e] text-sm px-4 py-2.5 border-b border-[#eef2f6] last:border-0">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatPanel({ userId, userName, onBack }: { userId: string; userName: string; onBack?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    const userMsg: Message     = { id: crypto.randomUUID(), role: "user", content: msg };
    const placeholder: Message = { id: crypto.randomUUID(), role: "assistant", content: "", loading: true };
    setMessages((prev) => [...prev, userMsg, placeholder]);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId, message: msg }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      if (data.sessionId && !sessionId) setSessionId(data.sessionId);

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { id: data.messageId, role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#e4e9ef] bg-white shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
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

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-[#0f766e] bg-[#e4f4ee] border border-[#c9e8dd] rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0f766e] animate-pulse block" />
            Online
          </div>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold rounded-md px-3 py-2 border transition-all",
              showUpload
                ? "bg-[#003d5c] border-[#003d5c] text-white"
                : "bg-white border-[#d1d9e0] text-[#003d5c] hover:bg-[#f7f9fc]"
            )}
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </header>

      {/* ── Upload panel ── */}
      {showUpload && (
        <div className="px-6 py-4 border-b border-[#e4e9ef] bg-[#f7f9fc] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-[#003d5c] uppercase tracking-widest">
              Bank Statement
            </p>
            <button
              onClick={() => setShowUpload(false)}
              className="text-[#5c6b7a] hover:text-[#0f1d2e] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <UploadPanel userId={userId} />
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 pb-6">
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#003d5c] flex items-center justify-center mx-auto shadow-md">
                <Flame className="w-7 h-7 text-[#ffcd00]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#003d5c] tracking-tight">
                  Good day, {userName}
                </h2>
                <p className="text-sm text-[#5c6b7a] mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Better financial decisions start here. Pick a topic or ask anything.
                </p>
              </div>
            </div>

            <div className="w-full max-w-md space-y-2.5">
              {QUICK_PROMPTS.map(({ icon: Icon, text, color }) => (
                <button
                  key={text}
                  onClick={() => send(text)}
                  disabled={loading}
                  className="w-full text-left bg-white hover:bg-[#f7f9fc] border border-[#e4e9ef] hover:border-[#c8dde8] hover:shadow-sm rounded-xl p-3.5 flex items-center gap-3.5 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", color)}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#0f1d2e] leading-snug">{text}</span>
                  <ChevronRight className="w-4 h-4 text-[#c8dde8] group-hover:text-[#003d5c] shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 msg-enter",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && !msg.loading && (
                  <div className="w-8 h-8 rounded-lg bg-[#003d5c] flex items-center justify-center shrink-0 mt-0.5">
                    <Flame className="w-4 h-4 text-[#ffcd00]" />
                  </div>
                )}

                {msg.role === "user" ? (
                  <div className="max-w-lg bg-[#003d5c] rounded-2xl rounded-tr-md px-4 py-2.5">
                    <p className="text-[15px] text-white leading-relaxed">{msg.content}</p>
                  </div>
                ) : msg.loading ? (
                  <div className="flex items-center gap-2.5 py-1 pl-1">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[#5c6b7a] dot-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-[#5c6b7a]">Thinking…</span>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <AssistantMessage content={msg.content} />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="px-6 pb-5 pt-3 border-t border-[#e4e9ef] bg-white shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2 bg-white rounded-xl border border-[#d1d9e0] focus-within:border-[#003d5c] focus-within:ring-2 focus-within:ring-[#003d5c]/10 transition-all px-4 py-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            disabled={loading}
            placeholder="Ask FIRE anything about your finances…"
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-[#0f1d2e] placeholder:text-[#9aa4b0] focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
            style={{ minHeight: "22px", maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-9 h-9 bg-[#ffcd00] hover:bg-[#e5b800] disabled:bg-[#f0f2f4] disabled:cursor-not-allowed text-[#003d5c] rounded-lg flex items-center justify-center transition-all shrink-0"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            }
          </button>
        </form>
        <p className="text-[11px] text-[#9aa4b0] text-center mt-2">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
