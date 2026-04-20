import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runFIRE } from "@/lib/advisor/run-fire";
import { getOrCreateSession } from "@/lib/profile/profile-context";
import { prisma } from "@/lib/db";

const RequestSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().optional(),
  message: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, message } = parsed.data;

    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User profile not found. Create a profile first." }, { status: 404 });
    }

    const session = await getOrCreateSession(userId, parsed.data.sessionId);
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "user", content: message },
    });

    const result = await runFIRE({
      sessionId: session.id,
      userId,
      userMessage: message,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[advisor] error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (sessionId) {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages });
  }

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json({ sessions });
}
