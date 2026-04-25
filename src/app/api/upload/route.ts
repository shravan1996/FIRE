import { NextRequest, NextResponse } from "next/server";
import {
  parseFile, extractFileText,
  isSupportedFile, SUPPORTED_EXTENSIONS,
} from "@/lib/ingestion/parse-file";
import { categorizeTransactions, type RawTransaction } from "@/lib/ingestion/parse-transactions";
import { prisma } from "@/lib/db";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
// Form 16 / 26AS / AIS extracts to 30-100K chars. With Claude's 1M context window
// the agent can absorb the whole document, so cap generously and only trim when
// a single doc would otherwise dominate the prompt.
const MAX_DOC_CHARS = 200_000;

const DOCUMENT_CATEGORIES = ["portfolio", "tax", "insurance", "loans"] as const;
type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

function isDocumentCategory(c: string): c is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(c);
}

function txnKey(t: { date: Date; description: string; amount: number }) {
  return `${t.date.toISOString()}|${t.description}|${t.amount}`;
}

/**
 * Dedupe against existing transactions in the file's date range,
 * then bulk-insert everything new.
 */
async function bulkInsertRawTransactions(
  userId: string,
  txns: RawTransaction[],
  source: string
): Promise<{ inserted: RawTransaction[]; skipped: number }> {
  if (txns.length === 0) return { inserted: [], skipped: 0 };

  let minDate = txns[0].date, maxDate = txns[0].date;
  for (const t of txns) {
    if (t.date < minDate) minDate = t.date;
    if (t.date > maxDate) maxDate = t.date;
  }

  const existing = await prisma.transaction.findMany({
    where: { userId, date: { gte: minDate, lte: maxDate } },
    select: { date: true, description: true, amount: true },
  });
  const existingKeys = new Set(existing.map(txnKey));

  const fresh = txns.filter((t) => !existingKeys.has(txnKey(t)));
  const skipped = txns.length - fresh.length;

  if (fresh.length > 0) {
    await prisma.transaction.createMany({
      data: fresh.map((t) => ({
        userId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        source,
        rawData: t.rawData,
      })),
    });
  }

  return { inserted: fresh, skipped };
}

/**
 * Append a compact record of this upload to the user's `uploaded_files` memory
 * entry so the FIRE chat agent can see every file the user has shared.
 */
async function recordUpload(
  userId: string,
  filename: string,
  category: string,
  transactionsAdded?: number,
) {
  const key = "uploaded_files";
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

  list.push({
    filename,
    category,
    uploadedAt: new Date().toISOString(),
    ...(transactionsAdded !== undefined ? { transactionsAdded } : {}),
  });

  await prisma.userMemory.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value: JSON.stringify(list), source: "upload" },
    update: { value: JSON.stringify(list) },
  });
}

/** Fire-and-forget: run Claude categorisation and update rows in place. */
async function categoriseAndUpdate(userId: string, txns: RawTransaction[]) {
  const start = Date.now();
  console.log(`[upload:bg] categorise start: ${txns.length} txns`);
  try {
    const categorised = await categorizeTransactions(txns);
    const aiMs = Date.now() - start;
    let matched = 0;
    for (const c of categorised) {
      const result = await prisma.transaction.updateMany({
        where: {
          userId,
          date: c.date,
          description: c.description,
          amount: c.amount,
          category: null,
        },
        data: {
          category: c.category,
          subCategory: c.subCategory,
          merchant: c.merchant || null,
        },
      });
      matched += result.count;
    }
    console.log(
      `[upload:bg] categorise done: ai=${aiMs}ms ` +
      `returned=${categorised.length}/${txns.length} matched=${matched}`
    );
    if (categorised.length === 0 && txns.length > 0) {
      console.warn(
        `[upload:bg] categorizer returned 0 results for ${txns.length} input txns — ` +
        `claude subprocess likely failed. Check earlier [categorize] log lines.`
      );
    } else if (matched < categorised.length) {
      console.warn(
        `[upload:bg] only matched ${matched}/${categorised.length} categorised txns — ` +
        `date/description/amount mismatch between insert and update.`
      );
    }
  } catch (err) {
    console.error("[upload:bg] categorise failed:", err);
  }
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

    // ─── Non-bank documents: extract raw text and store as memory ───
    if (isDocumentCategory(category)) {
      let text: string;
      try {
        text = (await extractFileText(file)).trim();
      } catch (extractErr) {
        const reason = extractErr instanceof Error ? extractErr.message : String(extractErr);
        console.error(`[upload] text extraction failed for ${file.name}:`, extractErr);
        return NextResponse.json(
          {
            error: `Could not read ${file.name}: ${reason}. ` +
              `If this is a password-protected or scanned PDF, unlock or OCR it first.`,
          },
          { status: 422 }
        );
      }

      if (text.length < 20) {
        return NextResponse.json(
          {
            error: `Extracted very little readable text from ${file.name} (${text.length} chars). ` +
              `It may be a scanned image PDF — try a text-based export or OCR the file first.`,
          },
          { status: 422 }
        );
      }

      const truncated = text.length > MAX_DOC_CHARS;
      const key = `docs_${category}`;
      const entry = {
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        text: text.slice(0, MAX_DOC_CHARS),
        ...(truncated ? { truncated: true, originalChars: text.length } : {}),
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

      await recordUpload(userId, file.name, category);

      const noteSuffix = truncated
        ? ` (kept first ${MAX_DOC_CHARS.toLocaleString()} of ${text.length.toLocaleString()} chars)`
        : "";
      return NextResponse.json({
        success: true,
        category,
        chars: text.length,
        truncated,
        message: `Saved ${file.name}${noteSuffix}.`,
      });
    }

    // ─── Bank statement flow ───
    const tParseStart = Date.now();
    const rawTransactions = await parseFile(file);
    const tParseEnd = Date.now();

    if (rawTransactions.length === 0) {
      return NextResponse.json({ error: "No valid transactions found in file" }, { status: 400 });
    }

    const source = file.name.split(".").pop()?.toLowerCase() ?? "upload";
    const { inserted, skipped } = await bulkInsertRawTransactions(userId, rawTransactions, source);
    const tInsertEnd = Date.now();

    console.log(
      `[upload] ${file.name}: parse=${tParseEnd - tParseStart}ms ` +
      `insert=${tInsertEnd - tParseEnd}ms ` +
      `txns=${rawTransactions.length} new=${inserted.length} dup=${skipped}`
    );

    await recordUpload(userId, file.name, "bank", inserted.length);

    // Fire-and-forget: categorise in the background, update rows as they complete.
    if (inserted.length > 0) void categoriseAndUpdate(userId, inserted);

    return NextResponse.json({
      success: true,
      total: rawTransactions.length,
      inserted: inserted.length,
      skipped,
      message: `Imported ${inserted.length} transactions${skipped ? ` (${skipped} duplicates skipped)` : ""}. Categorising in background.`,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
