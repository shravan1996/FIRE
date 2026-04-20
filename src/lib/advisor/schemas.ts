import { z } from "zod";

// ─── User context injected into every Claude call ────────────────────────────

export interface UserContext {
  name: string;
  monthlyIncome: number;
  netWorth: number | null;
  goalAmount: number | null;
  goalYear: number | null;
  riskAppetite: "conservative" | "moderate" | "aggressive";
  taxRegime: "old" | "new";
  holdings: HoldingContext[];
  recentTransactions: TransactionContext[];
  activeInsights: InsightContext[];
  userMemory: MemoryContext[];
}

export interface HoldingContext {
  assetType: string;
  name: string;
  ticker?: string | null;
  investedAmount: number;
  currentValue?: number | null;
  category?: string | null;
}

export interface TransactionContext {
  date: string;
  description: string;
  amount: number;
  type: string;
  category?: string | null;
  subCategory?: string | null;
}

export interface InsightContext {
  agentName: string;
  insightType: string;
  title: string;
  content: string;
  confidence: number;
  timesUsed: number;
}

export interface MemoryContext {
  key: string;
  value: string;
}

// ─── Insight extraction (post-session) ───────────────────────────────────────

export const InsightCandidateSchema = z.object({
  agentName: z.string(),
  insightType: z.enum(["observation", "pattern", "recommendation", "warning"]),
  title: z.string().max(120),
  content: z.string().max(600),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

export type InsightCandidate = z.infer<typeof InsightCandidateSchema>;

// ─── Request / Response ───────────────────────────────────────────────────────

export interface FireRequest {
  sessionId: string;
  userId: string;
  userMessage: string;
}

export interface FireResponse {
  reply: string;
  sessionId: string;
  messageId: string;
}
