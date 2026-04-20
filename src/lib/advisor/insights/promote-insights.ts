import { prisma } from "@/lib/db";
import { InsightCandidate } from "@/lib/advisor/schemas";

/**
 * Saves extracted candidates to the InsightCandidate table for review.
 * Only auto-promotes candidates with confidence >= 70 and type "pattern" | "observation".
 * All others require explicit user approval via the /api/insights route.
 */
export async function saveAndPromoteCandidates(
  userId: string,
  sessionId: string,
  candidates: InsightCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;

  let promoted = 0;

  for (const candidate of candidates) {
    const created = await prisma.insightCandidate.create({
      data: {
        userId,
        sessionId,
        agentName: candidate.agentName,
        insightType: candidate.insightType,
        title: candidate.title,
        content: candidate.content,
        evidence: JSON.stringify(candidate.evidence),
        confidence: candidate.confidence,
      },
    });

    const shouldAutoPromote =
      candidate.confidence >= 70 &&
      (candidate.insightType === "pattern" || candidate.insightType === "observation") &&
      candidate.agentName !== "finance_friend";

    if (shouldAutoPromote) {
      await promoteCandidate(userId, created.id);
      promoted++;
    }
  }

  return promoted;
}

export async function promoteCandidate(userId: string, candidateId: string): Promise<void> {
  const candidate = await prisma.insightCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.userId !== userId) return;

  // Check if a similar insight already exists; if so, supersede it
  const existing = await prisma.agentInsight.findFirst({
    where: {
      userId,
      agentName: candidate.agentName,
      title: candidate.title,
      status: "approved",
    },
  });

  if (existing) {
    await prisma.agentInsight.update({
      where: { id: existing.id },
      data: { status: "superseded" },
    });
  }

  const promoted = await prisma.agentInsight.create({
    data: {
      userId,
      agentName: candidate.agentName,
      insightType: candidate.insightType,
      title: candidate.title,
      content: candidate.content,
      evidence: candidate.evidence,
      confidence: candidate.confidence,
      status: "approved",
      version: existing ? existing.version + 1 : 1,
      approvedAt: new Date(),
    },
  });

  await prisma.insightCandidate.update({
    where: { id: candidateId },
    data: {
      reviewedAt: new Date(),
      decision: "approved",
      promotedId: promoted.id,
    },
  });
}

export async function rejectCandidate(userId: string, candidateId: string): Promise<void> {
  const candidate = await prisma.insightCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.userId !== userId) return;

  await prisma.insightCandidate.update({
    where: { id: candidateId },
    data: { reviewedAt: new Date(), decision: "rejected" },
  });
}
