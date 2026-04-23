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
        // Load every transaction the user has imported — capped only for safety
        // against runaway datasets. With Claude's 1M context the agent can
        // analyse several years of bank activity in one shot.
        transactions: { orderBy: { date: "desc" }, take: 20000 },
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

  // Transactions — build aggregate summary + full chronological list so the
  // agent can answer both "what's my overall spending pattern" and "what did
  // I spend on 2025-08-14" without ever being capped to a rolling window.
  const txns = ctx.recentTransactions;
  let txnSummaryText: string;
  let txnListText: string;

  if (txns.length === 0) {
    txnSummaryText = "No transactions available.";
    txnListText = "No transactions available.";
  } else {
    let totalCredits = 0, totalDebits = 0;
    let creditCount = 0, debitCount = 0;
    const byMonth = new Map<string, { inflow: number; outflow: number; count: number }>();
    const byCategory = new Map<string, number>();
    let uncategorisedDebits = 0;
    const byMerchant = new Map<string, { amount: number; count: number }>();

    for (const t of txns) {
      if (t.type === "credit") { totalCredits += t.amount; creditCount++; }
      else if (t.type === "debit") { totalDebits += t.amount; debitCount++; }

      const monthKey = t.date.slice(0, 7); // YYYY-MM
      const m = byMonth.get(monthKey) ?? { inflow: 0, outflow: 0, count: 0 };
      if (t.type === "credit") m.inflow += t.amount;
      else if (t.type === "debit") m.outflow += t.amount;
      m.count++;
      byMonth.set(monthKey, m);

      if (t.type === "debit") {
        if (t.category) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
        else uncategorisedDebits += t.amount;

        const merchantKey = t.description.slice(0, 40).toUpperCase();
        const entry = byMerchant.get(merchantKey) ?? { amount: 0, count: 0 };
        entry.amount += t.amount;
        entry.count += 1;
        byMerchant.set(merchantKey, entry);
      }
    }

    // chronological range
    const sortedAsc = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedAsc[0].date;
    const lastDate = sortedAsc[sortedAsc.length - 1].date;

    const monthlyLines = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const net = v.inflow - v.outflow;
        const sign = net >= 0 ? "+" : "";
        return `  ${k}: in ${fmt(v.inflow)} / out ${fmt(v.outflow)} (net ${sign}${fmt(net)}, ${v.count} txns)`;
      })
      .join("\n");

    const catTotal = totalDebits || 1;
    const categoryLines = Array.from(byCategory.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `  ${k}: ${fmt(v)} (${((v / catTotal) * 100).toFixed(1)}%)`)
      .join("\n");
    const uncatLine = uncategorisedDebits > 0
      ? `\n  uncategorised: ${fmt(uncategorisedDebits)} (${((uncategorisedDebits / catTotal) * 100).toFixed(1)}%)`
      : "";

    const topMerchants = Array.from(byMerchant.entries())
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 15)
      .map(([k, v], i) => `  ${i + 1}. ${k} — ${fmt(v.amount)} (${v.count} txns)`)
      .join("\n");

    txnSummaryText = `Period: ${firstDate} → ${lastDate}
Totals: ${creditCount} credits of ${fmt(totalCredits)}, ${debitCount} debits of ${fmt(totalDebits)}, net ${fmt(totalCredits - totalDebits)}

Monthly flow:
${monthlyLines}

Spending by category (debits):
${categoryLines}${uncatLine}

Top merchants by spend:
${topMerchants}`;

    // Full list — reverse-chronological (matches the DB query) so the most
    // recent context is near the end of the prompt where the model attends most.
    txnListText = txns
      .map((t) => `${t.date} | ${t.type.toUpperCase()} | ${fmt(t.amount)} | ${t.description}${t.category ? ` [${t.category}]` : ""}`)
      .join("\n");
  }

  // Insights
  const insightsText = ctx.activeInsights.length
    ? ctx.activeInsights
        .map((i) => `- [${i.agentName}] ${i.title}: ${i.content}`)
        .join("\n")
    : "None yet.";

  // Uploaded files — pull out the `uploaded_files` entry and render compactly.
  // Each entry: { filename, category, uploadedAt, transactionsAdded? }
  let uploadedFilesText = "None yet.";
  const uploadsEntry = ctx.userMemory.find((m) => m.key === "uploaded_files");
  if (uploadsEntry) {
    try {
      const files = JSON.parse(uploadsEntry.value) as Array<{
        filename: string;
        category: string;
        uploadedAt: string;
        transactionsAdded?: number;
      }>;
      if (Array.isArray(files) && files.length > 0) {
        uploadedFilesText = files
          .map((f) => {
            const date = f.uploadedAt?.slice(0, 10) ?? "";
            const txns = typeof f.transactionsAdded === "number" ? `, ${f.transactionsAdded} txns` : "";
            return `- ${f.filename}  (${f.category}, ${date}${txns})`;
          })
          .join("\n");
      }
    } catch { /* fall back to "None yet." */ }
  }

  // Memory — exclude `uploaded_files` (rendered above) to avoid duplicating
  // the list as a giant JSON blob in the notes section.
  const otherMemory = ctx.userMemory.filter((m) => m.key !== "uploaded_files");
  const memoryText = otherMemory.length
    ? otherMemory.map((m) => `- ${m.key}: ${m.value}`).join("\n")
    : "None.";

  return `--- User Profile ---
${profileLines}

--- Portfolio (total ≈ ${fmt(total)}) ---
${holdingsText}

--- Transaction Summary (${txns.length} transactions) ---
${txnSummaryText}

--- All Transactions (newest first) ---
${txnListText}

--- Uploaded Files ---
${uploadedFilesText}

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
