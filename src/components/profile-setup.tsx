"use client";

import { useState } from "react";
import { Loader2, Flame, TrendingUp, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileSetupProps {
  onComplete: (userId: string) => void;
}

const RISK_OPTIONS = [
  { value: "conservative", label: "Conservative", desc: "Capital preservation" },
  { value: "moderate",     label: "Moderate",     desc: "Balanced approach" },
  { value: "aggressive",   label: "Aggressive",   desc: "Growth-focused" },
] as const;

const FEATURES = [
  { icon: TrendingUp, title: "Portfolio Analysis", desc: "Real-time allocation review and rebalancing signals" },
  { icon: Shield,     title: "Tax Optimisation",  desc: "80C, LTCG, regime comparison and deduction gaps" },
  { icon: Zap,        title: "Spending Insights", desc: "AI-categorised bank statement analysis" },
];

export function ProfileSetup({ onComplete }: ProfileSetupProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    riskAppetite: "moderate" as "conservative" | "moderate" | "aggressive",
    taxRegime:    "new"      as "old" | "new",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      riskAppetite: form.riskAppetite,
      taxRegime: form.taxRegime,
    };

    const res  = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error?.formErrors?.[0] ?? data.error ?? "Failed to create profile");
    } else {
      onComplete(data.profile.id);
    }
  }

  return (
    <div className="min-h-screen bg-white flex">

      {/* ── Left panel – branding ── */}
      <div className="hidden lg:flex w-96 xl:w-[28rem] flex-col justify-between p-10 bg-[#003d5c] text-white relative overflow-hidden">
        {/* Decorative gold stripe */}
        <div className="absolute top-0 right-0 w-1.5 h-full bg-[#ffcd00]" />

        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-[#ffcd00] flex items-center justify-center">
            <Flame className="w-5 h-5 text-[#003d5c]" />
          </div>
          <span className="text-lg font-bold tracking-tight">FIRE</span>
        </div>

        <div className="space-y-10">
          <div>
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              Better financial decisions start here.
            </h2>
            <p className="text-base text-white/70 mt-4 leading-relaxed">
              Your AI financial advisor for Indian markets. Set up once, personalised analysis forever.
            </p>
          </div>

          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-[#ffcd00]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-sm text-white/60 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/50">
          <Check className="w-3.5 h-3.5 text-[#ffcd00]" />
          <span>Your data stays on your device</span>
        </div>
      </div>

      {/* ── Right panel – form ── */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto bg-[#f7f9fc]">
        <div className="w-full max-w-md py-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-[#003d5c] flex items-center justify-center">
              <Flame className="w-4 h-4 text-[#ffcd00]" />
            </div>
            <span className="text-base font-bold text-[#003d5c]">FIRE</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#e4e9ef] shadow-sm p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold text-[#5c6b7a] uppercase tracking-wide mb-2">Step 1 of 2</p>
              <h1 className="text-2xl font-bold text-[#003d5c] tracking-tight">Set up your profile</h1>
              <p className="text-sm text-[#5c6b7a] mt-1.5">
                Takes 30 seconds. Personalises every analysis.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">

              <Field label="Your name">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Shravan"
                  className={inputCls}
                />
              </Field>

              <Field label="Risk appetite">
                <div className="grid grid-cols-3 gap-2">
                  {RISK_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("riskAppetite", opt.value)}
                      className={cn(
                        "rounded-lg p-2.5 border-2 text-left transition-all",
                        form.riskAppetite === opt.value
                          ? "border-[#003d5c] bg-[#e6f0f6]"
                          : "border-[#e4e9ef] bg-white hover:border-[#c8dde8]"
                      )}
                    >
                      <p className={cn(
                        "text-xs font-bold",
                        form.riskAppetite === opt.value ? "text-[#003d5c]" : "text-[#0f1d2e]"
                      )}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-[#5c6b7a] mt-0.5 leading-tight">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Income tax regime">
                <div className="grid grid-cols-2 gap-2">
                  {(["new", "old"] as const).map((regime) => (
                    <button
                      key={regime}
                      type="button"
                      onClick={() => set("taxRegime", regime)}
                      className={cn(
                        "rounded-lg p-2.5 border-2 text-left transition-all",
                        form.taxRegime === regime
                          ? "border-[#003d5c] bg-[#e6f0f6]"
                          : "border-[#e4e9ef] bg-white hover:border-[#c8dde8]"
                      )}
                    >
                      <p className={cn(
                        "text-sm font-bold capitalize",
                        form.taxRegime === regime ? "text-[#003d5c]" : "text-[#0f1d2e]"
                      )}>
                        {regime} Regime
                      </p>
                      <p className="text-[10px] text-[#5c6b7a] mt-0.5">
                        {regime === "new" ? "Lower rates, fewer deductions" : "Higher rates, more deductions"}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>

              {error && (
                <div className="text-sm text-[#b91c1c] bg-[#fde8e8] border border-[#f5c7c7] rounded-lg p-3.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ffcd00] hover:bg-[#e5b800] disabled:opacity-60 disabled:cursor-not-allowed text-[#003d5c] text-sm font-bold rounded-lg py-3.5 transition-all flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up…
                  </>
                ) : (
                  "Start with FIRE →"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-[#d1d9e0] rounded-lg px-3.5 py-2.5 text-sm text-[#0f1d2e] placeholder:text-[#9aa4b0] focus:outline-none focus:border-[#003d5c] focus:ring-2 focus:ring-[#003d5c]/10 transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#003d5c] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
