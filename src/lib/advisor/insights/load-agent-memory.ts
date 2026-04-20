import { prisma } from "@/lib/db";
import { InsightContext, MemoryContext } from "@/lib/advisor/schemas";

export async function loadAgentMemory(userId: string): Promise<{
  activeInsights: InsightContext[];
  userMemory: MemoryContext[];
}> {
  const [insights, memory] = await Promise.all([
    prisma.agentInsight.findMany({
      where: { userId, status: "approved" },
      orderBy: [{ confidence: "desc" }, { timesUsed: "desc" }],
      take: 20,
    }),
    prisma.userMemory.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
  ]);

  const activeInsights: InsightContext[] = insights.map((i) => ({
    agentName: i.agentName,
    insightType: i.insightType,
    title: i.title,
    content: i.content,
    confidence: i.confidence,
    timesUsed: i.timesUsed,
  }));

  const userMemory: MemoryContext[] = memory.map((m) => ({
    key: m.key,
    value: m.value,
  }));

  return { activeInsights, userMemory };
}

export async function markInsightsUsed(userId: string): Promise<void> {
  await prisma.agentInsight.updateMany({
    where: { userId, status: "approved" },
    data: {
      timesUsed: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}
