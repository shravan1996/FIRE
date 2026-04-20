import { UserContext, FireRequest, FireResponse } from "@/lib/advisor/schemas";
import { loadAgentMemory, markInsightsUsed } from "@/lib/advisor/insights/load-agent-memory";
import { prisma } from "@/lib/db";
import { claudeComplete } from "@/lib/ai-client";
import { loadAgentSkill } from "@/lib/advisor/skills/load-skill";
import { SKILL_CATALOG } from "@/lib/advisor/skills/catalog";

// Fallback descriptions used if a skill file is missing
const SKILL_FALLBACKS: Record<string, string> = {
  "market-researcher": "You are an expert in Indian and global equity markets, macro conditions, RBI/Fed signals, and sector trends.",
  "accountant": "You are an expert in personal finance accounting — spending analysis, savings rate, cash flow, budget categories.",
  "investment-manager": "You are an expert in portfolio construction, asset allocation, rebalancing, and concentration risk for Indian investors.",
  "tax-analyst": "You are an expert in Indian income tax — 80C/80D deductions, LTCG/STCG, ITR deadlines, old vs new regime. Always recommend CA consultation.",
  "finance-friend": "You surface 1-2 speculative, asymmetric ideas. Always prefix with a speculative disclaimer. Keep confidence non-binding.",
};

async function buildSystemPrompt(): Promise<string> {
  const sections = await Promise.all(
    SKILL_CATALOG.map(async (s) => {
      const content = await loadAgentSkill(s.key, SKILL_FALLBACKS[s.key] ?? s.label);
      return `## ${s.label}\n\n${content}`;
    })
  );

  return `You are FIRE — a personal Financial Intelligence & Recommendation Engine for Indian investors. You combine the expertise of five specialist domains:

${sections.join("\n\n---\n\n")}

---

General rules:
- Respond in plain, conversational prose. Never output JSON or structured data formats.
- Be specific and actionable, not generic.
- Use ₹ for all INR amounts.
- Draw on whichever domains are relevant to the question.
- Clearly flag any data gaps or assumptions.
- For speculative ideas, always lead with a risk disclaimer.
- For tax advice, recommend CA consultation for final decisions.
- Do not repeat advice from prior sessions unless conditions have materially changed.`;
}

async function buildUserContext(userId: string): Promise<UserContext> {
  const [profile, memory] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      include: {
        holdings: true,
        transactions: { orderBy: { date: "desc" }, take: 60 },
      },
    }),
    loadAgentMemory(userId),
  ]);

  if (!profile) throw new Error(`User not found: ${userId}`);

  return {
    name: profile.name,
    monthlyIncome: profile.monthlyIncome,
    netWorth: profile.netWorth,
    goalAmount: profile.goalAmount,
    goalYear: profile.goalYear,
    riskAppetite: profile.riskAppetite as UserContext["riskAppetite"],
    taxRegime: profile.taxRegime as UserContext["taxRegime"],
    holdings: profile.holdings.map((h) => ({
      assetType: h.assetType,
      name: h.name,
      ticker: h.ticker,
      investedAmount: h.investedAmount,
      currentValue: h.currentValue,
      category: h.category,
    })),
    recentTransactions: profile.transactions.map((t) => ({
      date: t.date.toISOString().split("T")[0],
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: t.category,
      subCategory: t.subCategory,
    })),
    activeInsights: memory.activeInsights,
    userMemory: memory.userMemory,
  };
}

function buildUserPrompt(ctx: UserContext, message: string): string {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Profile
  const profileLines = [
    `Name: ${ctx.name}`,
    `Monthly income: ${fmt(ctx.monthlyIncome)}`,
    ctx.netWorth != null ? `Net worth: ${fmt(ctx.netWorth)}` : null,
    ctx.goalAmount != null ? `Goal: ${fmt(ctx.goalAmount)} by ${ctx.goalYear}` : null,
    `Risk appetite: ${ctx.riskAppetite}`,
    `Tax regime: ${ctx.taxRegime}`,
  ].filter(Boolean).join("\n");

  // Holdings
  const total = ctx.holdings.reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);
  const holdingsText = ctx.holdings.length
    ? ctx.holdings.map((h) => {
        const val = h.currentValue ?? h.investedAmount;
        const alloc = total > 0 ? `${((val / total) * 100).toFixed(1)}%` : "?";
        const pnl = h.currentValue
          ? ` | P&L ${(((h.currentValue - h.investedAmount) / h.investedAmount) * 100).toFixed(1)}%`
          : "";
        return `- ${h.name} (${h.assetType}): invested ${fmt(h.investedAmount)}, current ${fmt(val)} (${alloc})${pnl}`;
      }).join("\n")
    : "No holdings provided.";

  // Transactions
  const txnText = ctx.recentTransactions.length
    ? ctx.recentTransactions
        .slice(0, 60)
        .map((t) =>
          `${t.date} | ${t.type.toUpperCase()} | ${fmt(t.amount)} | ${t.description}${t.category ? ` [${t.category}]` : ""}`
        )
        .join("\n")
    : "No recent transactions.";

  // Insights
  const insightsText = ctx.activeInsights.length
    ? ctx.activeInsights
        .map((i) => `- [${i.agentName}] ${i.title}: ${i.content}`)
        .join("\n")
    : "None yet.";

  // Memory
  const memoryText = ctx.userMemory.length
    ? ctx.userMemory.map((m) => `- ${m.key}: ${m.value}`).join("\n")
    : "None.";

  return `--- User Profile ---
${profileLines}

--- Portfolio (total ≈ ${fmt(total)}) ---
${holdingsText}

--- Recent Transactions (last 60) ---
${txnText}

--- Insights from Prior Sessions ---
${insightsText}

--- User Notes ---
${memoryText}

--- Question ---
${message}`;
}

export async function runFIRE(req: FireRequest): Promise<FireResponse> {
  const { sessionId, userId, userMessage } = req;

  const [systemPrompt, ctx] = await Promise.all([
    buildSystemPrompt(),
    buildUserContext(userId),
  ]);

  const reply = await claudeComplete(systemPrompt, buildUserPrompt(ctx, userMessage));

  const savedMessage = await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: reply,
    },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  await markInsightsUsed(userId);

  return { reply, sessionId, messageId: savedMessage.id };
}
