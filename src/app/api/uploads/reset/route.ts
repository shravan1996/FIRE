import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const [txns, docs] = await Promise.all([
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.userMemory.deleteMany({
      where: {
        userId,
        OR: [
          { key: { startsWith: "docs_" } },
          { key: "uploaded_files" },
        ],
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    transactionsDeleted: txns.count,
    documentsDeleted: docs.count,
  });
}
