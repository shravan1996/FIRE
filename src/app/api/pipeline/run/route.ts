import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseCSV, categorizeTransactions } from "@/lib/ingestion/parse-transactions";
import { parseFile, isSupportedFile, SUPPORTED_EXTENSIONS } from "@/lib/ingestion/parse-file";
import { runFIRE } from "@/lib/advisor/run-fire";
import { getOrCreateSession } from "@/lib/profile/profile-context";
import type { RawTransaction } from "@/lib/ingestion/parse-transactions";

const JsonSchema = z.object({
  userId: z.string().min(1),
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  csvContent: z.string().optional(),
});

class InputError extends Error {}

type IngestionStats = {
  attempted: number;
  inserted: number;
  skipped: number;
};

type PipelineInput = {
  userId: string;
  userMessage: string;
  sessionId?: string;
};

async function ingestTransactions(
  userId: string,
  rawTransactions: RawTransaction[],
  source: string
): Promise<IngestionStats> {
  if (rawTransactions.length === 0) return { attempted: 0, inserted: 0, skipped: 0 };

  const categorized = await categorizeTransactions(rawTransactions);
  let inserted = 0;
  let skipped = 0;

  for (const txn of categorized) {
    const existing = await prisma.transaction.findFirst({
      where: { userId, date: txn.date, description: txn.description, amount: txn.amount },
    });

    if (existing) { skipped++; continue; }

    await prisma.transaction.create({
      data: {
        userId,
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        type: txn.type,
        category: txn.category,
        subCategory: txn.subCategory,
        merchant: txn.merchant || null,
        source,
        rawData: txn.rawData,
      },
    });
    inserted++;
  }

  return { attempted: rawTransactions.length, inserted, skipped };
}

async function parseRequest(req: NextRequest): Promise<{
  fireInput: PipelineInput;
  file?: File;
  csvText?: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const userId = String(formData.get("userId") ?? "");
    const message = String(formData.get("message") ?? "");
    const sessionId = String(formData.get("sessionId") ?? "") || undefined;
    const fileEntry = formData.get("file");

    if (!userId || !message) throw new InputError("userId and message are required");

    let file: File | undefined;
    if (fileEntry instanceof File) {
      if (!isSupportedFile(fileEntry.name)) {
        throw new InputError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      }
      if (fileEntry.size > 10 * 1024 * 1024) {
        throw new InputError("File too large (max 10 MB)");
      }
      file = fileEntry;
    }

    return { fireInput: { userId, userMessage: message, sessionId }, file };
  }

  const body = await req.json();
  const parsed = JsonSchema.parse(body);

  return {
    fireInput: { userId: parsed.userId, userMessage: parsed.message, sessionId: parsed.sessionId },
    csvText: parsed.csvContent,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { fireInput, file, csvText } = await parseRequest(req);

    const user = await prisma.userProfile.findUnique({ where: { id: fireInput.userId } });
    if (!user) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    let ingestion: IngestionStats | null = null;

    if (file) {
      const raw = await parseFile(file);
      const source = file.name.split(".").pop()?.toLowerCase() ?? "upload";
      ingestion = await ingestTransactions(fireInput.userId, raw, source);
    } else if (csvText && csvText.trim().length > 0) {
      const raw = parseCSV(csvText);
      ingestion = await ingestTransactions(fireInput.userId, raw, "csv");
    }

    const session = await getOrCreateSession(fireInput.userId, fireInput.sessionId);

    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "user", content: fireInput.userMessage },
    });

    const result = await runFIRE({
      sessionId: session.id,
      userId: fireInput.userId,
      userMessage: fireInput.userMessage,
    });

    return NextResponse.json({ ...result, ingestion });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline execution failed" },
      { status: 500 }
    );
  }
}
