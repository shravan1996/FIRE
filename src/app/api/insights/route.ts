import { NextRequest, NextResponse } from "next/server";
import { promoteCandidate, rejectCandidate } from "@/lib/advisor/insights/promote-insights";
import { prisma } from "@/lib/db";

// GET /api/insights?userId=...&status=pending|approved
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const status = req.nextUrl.searchParams.get("status") ?? "approved";

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (status === "pending") {
    const candidates = await prisma.insightCandidate.findMany({
      where: { userId, reviewedAt: null },
      orderBy: { extractedAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ candidates });
  }

  const insights = await prisma.agentInsight.findMany({
    where: { userId, status },
    orderBy: [{ confidence: "desc" }, { timesUsed: "desc" }],
  });

  return NextResponse.json({ insights });
}

// POST /api/insights — approve or reject a candidate
export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    const { candidateId, action } = await req.json();
    if (!candidateId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "candidateId and action (approve|reject) required" }, { status: 400 });
    }

    if (action === "approve") {
      await promoteCandidate(userId, candidateId);
    } else {
      await rejectCandidate(userId, candidateId);
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/insights?userId=...&insightId=... — remove an approved insight
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const insightId = req.nextUrl.searchParams.get("insightId");

  if (!userId || !insightId) return NextResponse.json({ error: "userId and insightId required" }, { status: 400 });

  const insight = await prisma.agentInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.agentInsight.update({ where: { id: insightId }, data: { status: "rejected" } });
  return NextResponse.json({ success: true });
}
