import { NextRequest, NextResponse } from "next/server";
import {
  parseFile, extractFileText,
  isSupportedFile, SUPPORTED_EXTENSIONS,
} from "@/lib/ingestion/parse-file";
import { categorizeTransactions } from "@/lib/ingestion/parse-transactions";
import { prisma } from "@/lib/db";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DOC_CHARS = 8000;        // cap per uploaded document stored as memory

const DOCUMENT_CATEGORIES = ["portfolio", "tax", "insurance", "loans"] as const;
type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

function isDocumentCategory(c: string): c is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(c);
}

export async function POST(req: NextRequest) {
  const userId   = req.nextUrl.searchParams.get("userId");
  const category = req.nextUrl.searchParams.get("category") ?? "bank";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.userProfile.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!isSupportedFile(file.name)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    // ─── Non-bank documents: just extract text and store as memory ───
    if (isDocumentCategory(category)) {
      let text = "";
      try {
        text = (await extractFileText(file)).trim();
      } catch (extractErr) {
        console.warn(`[upload] text extraction failed for ${file.name}:`, extractErr);
        // continue anyway — the filename alone is still useful to FIRE
      }

      const key = `docs_${category}`;
      const entry = {
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        text: text.slice(0, MAX_DOC_CHARS),
      };

      const existing = await prisma.userMemory.findUnique({
        where: { userId_key: { userId, key } },
      });

      let list: unknown[] = [];
      if (existing) {
        try {
          const parsed = JSON.parse(existing.value);
          if (Array.isArray(parsed)) list = parsed;
        } catch { /* overwrite malformed */ }
      }
      list.push(entry);

      await prisma.userMemory.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, value: JSON.stringify(list), source: "upload" },
        update: { value: JSON.stringify(list) },
      });

      return NextResponse.json({
        success: true,
        category,
        message: text.length > 20
          ? `Saved ${file.name}.`
          : `Recorded ${file.name} (limited text extracted).`,
      });
    }

    // ─── Bank statement flow: extract + categorise transactions ───
    const rawTransactions = await parseFile(file);

    if (rawTransactions.length === 0) {
      return NextResponse.json({ error: "No valid transactions found in file" }, { status: 400 });
    }

    const categorized = await categorizeTransactions(rawTransactions);
    const source = file.name.split(".").pop()?.toLowerCase() ?? "upload";

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

    return NextResponse.json({
      success: true,
      total: rawTransactions.length,
      inserted,
      skipped,
      message: `Imported ${inserted} transactions (${skipped} duplicates skipped).`,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
