import { z } from "zod";
import { RawTransaction, parseCSV } from "./parse-transactions";
import { claudeComplete } from "@/lib/ai-client";

export const SUPPORTED_EXTENSIONS = [
  ".csv", ".xls", ".xlsx", ".pdf", ".docx", ".html", ".htm", ".txt", ".ofx", ".qfx",
];

export function isSupportedFile(filename: string): boolean {
  const ext = "." + (filename.split(".").pop()?.toLowerCase() ?? "");
  return SUPPORTED_EXTENSIONS.includes(ext);
}

async function parseSpreadsheet(buffer: Buffer): Promise<RawTransaction[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Spreadsheet has no sheets.");
  const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  // Try deterministic CSV parsing first; fallback to text extraction for messy exports.
  try {
    const result = parseCSV(csv);
    if (result.length > 0) return result;
  } catch {
    // fall through to text extraction fallback
  }
  return extractTransactionsFromText(csv);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const ExtractedTxnSchema = z.object({
  transactions: z.array(z.object({
    date: z.string(),
    description: z.string(),
    amount: z.number().positive(),
    type: z.enum(["credit", "debit"]),
  })),
});

const EXTRACTION_SYSTEM = `Extract all bank/financial transactions from the document text.

Return ONLY valid JSON in this exact shape:
{ "transactions": [{ "date": "YYYY-MM-DD", "description": "...", "amount": number, "type": "credit"|"debit" }] }

Rules:
- date must be YYYY-MM-DD. Infer year from context if omitted.
- amount is a positive number — no currency symbols, no commas.
- type: "debit" = money going out; "credit" = money coming in.
- description: clean transaction narration.
- Exclude account summaries, opening/closing balances, and running totals.
- If no transactions found, return { "transactions": [] }.`;

async function extractTransactionsFromText(text: string): Promise<RawTransaction[]> {
  const truncated = text.slice(0, 50000);
  if (truncated.trim().length < 20) return [];

  const raw = JSON.parse(
    await claudeComplete(EXTRACTION_SYSTEM, `Extract transactions from this bank statement:\n\n${truncated}`)
  );

  const parsed = ExtractedTxnSchema.safeParse(raw);
  if (!parsed.success) return [];

  return parsed.data.transactions.flatMap((t) => {
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return [];
    return [{
      date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      rawData: JSON.stringify(t),
    }];
  });
}

/**
 * Extract raw text from a file — no AI, no transaction parsing.
 * Used for non-bank document categories (tax, insurance, loans, portfolio)
 * where we just want to store the content for FIRE to reference later.
 */
export async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case "csv":
    case "txt":
    case "ofx":
    case "qfx":
      return await file.text();
    case "xls":
    case "xlsx": {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return "";
      return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    }
    case "pdf":
      return await extractPdfText(buffer);
    case "docx":
      return await extractDocxText(buffer);
    case "html":
    case "htm":
      return stripHtml(await file.text());
    default:
      return await file.text();
  }
}

export async function parseFile(file: File): Promise<RawTransaction[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case "csv": {
      const text = await file.text();
      try {
        const result = parseCSV(text);
        if (result.length > 0) return result;
      } catch {
        // fall through to text extraction fallback
      }
      return extractTransactionsFromText(text);
    }
    case "xls":
    case "xlsx":
      return parseSpreadsheet(buffer);
    case "pdf":
      return extractTransactionsFromText(await extractPdfText(buffer));
    case "docx":
      return extractTransactionsFromText(await extractDocxText(buffer));
    case "html":
    case "htm":
      return extractTransactionsFromText(stripHtml(await file.text()));
    default:
      return extractTransactionsFromText(await file.text());
  }
}
