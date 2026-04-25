import Papa from "papaparse";
import { z } from "zod";
import { claudeComplete } from "@/lib/ai-client";

export interface RawTransaction {
  date: Date;
  description: string;
  amount: number;
  type: "credit" | "debit";
  rawData: string;
}

export interface CategorizedTransaction extends RawTransaction {
  category: string;
  subCategory: string;
  merchant: string;
}

// Substring fragments that match common Indian bank column headers.
// Covers SBI/HDFC/ICICI/Axis/Kotak variants: "Txn Date", "Tran Date", "Value Dt",
// "Narration", "Description", "Transaction Remarks", "Withdrawal Amt.",
// "Withdrawal Amount (INR)", "Deposit Amt.", etc.
const DATE_FRAGMENTS   = ["date", "dt."];
const DESC_FRAGMENTS   = ["narrat", "description", "particular", "remark", "detail"];
const DEBIT_FRAGMENTS  = ["debit", "withdraw", "dr "];
const CREDIT_FRAGMENTS = ["credit", "deposit", "cr "];
const AMOUNT_FRAGMENTS = ["amount", "amt"];
const BALANCE_FRAGMENTS = ["balance", "bal"];

function normalizeKey(k: string) {
  return k.toLowerCase().trim().replace(/\s+/g, " ");
}

// Match if any fragment appears as substring of any header, but skip balance columns.
function findColumn(headers: string[], fragments: string[], excludeFragments: string[] = BALANCE_FRAGMENTS): string | null {
  for (const h of headers) {
    const normalized = normalizeKey(h);
    if (excludeFragments.some((f) => normalized.includes(f))) continue;
    if (fragments.some((f) => normalized.includes(f))) return h;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseIndianDate(raw: string): Date | null {
  const clean = raw.trim();
  if (!clean) return null;

  // dd/mm/yyyy or dd/mm/yy
  let m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]);
    const month = parseInt(m[2]) - 1;
    let year = parseInt(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // yyyy-mm-dd
  m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // dd-MMM-yyyy, dd MMM yyyy, dd-MMM-yy
  m = clean.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[\s\-](\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month !== undefined) {
      let year = parseInt(m[3]);
      if (year < 100) year += year < 50 ? 2000 : 1900;
      const d = new Date(year, month, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback: native Date parsing
  const natural = new Date(clean);
  return isNaN(natural.getTime()) ? null : natural;
}

function tryParseAt(csvText: string, skipLines: number): RawTransaction[] | null {
  const lines = csvText.split(/\r?\n/);
  if (skipLines >= lines.length) return null;
  const sliced = lines.slice(skipLines).join("\n");

  const result = Papa.parse<Record<string, string>>(sliced, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers  = result.meta.fields ?? [];
  const dateCol  = findColumn(headers, DATE_FRAGMENTS);
  const descCol  = findColumn(headers, DESC_FRAGMENTS);
  const debitCol = findColumn(headers, DEBIT_FRAGMENTS);
  const creditCol = findColumn(headers, CREDIT_FRAGMENTS);
  const amountCol = findColumn(headers, AMOUNT_FRAGMENTS);

  if (!dateCol || !descCol) return null;

  const transactions: RawTransaction[] = [];

  for (const row of result.data) {
    const date = parseIndianDate(row[dateCol] ?? "");
    if (!date) continue;

    const description = row[descCol]?.trim() ?? "";
    if (!description) continue;

    let amount = 0;
    let type: "credit" | "debit" = "debit";

    if (debitCol && creditCol) {
      const debit  = parseFloat((row[debitCol]  ?? "").replace(/[,₹\s]/g, "")) || 0;
      const credit = parseFloat((row[creditCol] ?? "").replace(/[,₹\s]/g, "")) || 0;
      if (debit > 0)      { amount = debit;  type = "debit";  }
      else if (credit > 0){ amount = credit; type = "credit"; }
      else continue;
    } else if (amountCol) {
      const raw = (row[amountCol] ?? "").replace(/[,₹\s]/g, "");
      amount = Math.abs(parseFloat(raw)) || 0;
      type   = parseFloat(raw) < 0 ? "debit" : "credit";
    } else {
      continue;
    }

    if (amount === 0) continue;

    transactions.push({ date, description, amount, type, rawData: JSON.stringify(row) });
  }

  return transactions;
}

export function parseCSV(csvText: string): RawTransaction[] {
  // Many Indian bank statements include 2-8 metadata rows before the header.
  // Try different skip offsets and pick the first that finds real columns.
  let best: RawTransaction[] = [];
  for (let skip = 0; skip < 15; skip++) {
    const result = tryParseAt(csvText, skip);
    if (result && result.length > best.length) {
      best = result;
      if (best.length >= 5) break; // good enough, bail early
    }
  }
  if (best.length === 0) {
    throw new Error("CSV must have date and description/narration columns.");
  }
  return best;
}

const CategorizationResultSchema = z.object({
  transactions: z.array(
    z.object({
      index: z.number(),
      category: z.enum(["needs", "wants", "waste", "investment", "income", "transfer"]),
      subCategory: z.string(),
      merchant: z.string(),
    })
  ),
});

const CATEGORIZATION_SYSTEM = `You are a bank transaction categorizer for Indian users. For each transaction, return:
- category: "needs" | "wants" | "waste" | "investment" | "income" | "transfer"
  - needs: rent, utilities, groceries, medicine, EMI, insurance
  - wants: dining, entertainment, shopping, travel
  - waste: late fees, fines, gambling, excessive subscriptions
  - investment: SIP, stocks, FD, mutual fund
  - income: salary, interest, dividends, refunds
  - transfer: UPI transfer, wallet load, inter-account
- subCategory: specific sub-type (e.g., "rent", "food_delivery", "netflix", "sip_mf")
- merchant: clean merchant name or empty string

Return JSON: { "transactions": [{ "index": n, "category": "...", "subCategory": "...", "merchant": "..." }] }`;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function categorizeTransactions(
  txns: RawTransaction[]
): Promise<CategorizedTransaction[]> {
  if (txns.length === 0) return [];

  const CHUNK = 40;
  const MAX_CONCURRENT = 3;
  const offsets: number[] = [];
  for (let i = 0; i < txns.length; i += CHUNK) offsets.push(i);

  const chunkResults = await mapLimit(offsets, MAX_CONCURRENT, async (offset) => {
    const chunk = txns.slice(offset, offset + CHUNK);
    const payload = chunk.map((t, idx) => ({
      index: offset + idx,
      description: t.description,
      amount: t.amount,
      type: t.type,
    }));

    let response = "";
    try {
      response = await claudeComplete(CATEGORIZATION_SYSTEM, JSON.stringify(payload));
    } catch (err) {
      console.error(
        `[categorize] claudeComplete failed (chunk offset=${offset}, size=${chunk.length}):`,
        err
      );
      return [];
    }

    let raw: unknown;
    try {
      raw = JSON.parse(response);
    } catch (err) {
      console.error(
        `[categorize] JSON.parse failed (chunk offset=${offset}). ` +
        `Claude returned non-JSON output. First 300 chars: ` +
        JSON.stringify(response.slice(0, 300))
      );
      void err;
      return [];
    }

    const parsed = CategorizationResultSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        `[categorize] schema validation failed (chunk offset=${offset}). ` +
        `Issues: ${JSON.stringify(parsed.error.issues.slice(0, 3))}. ` +
        `Raw shape: ${JSON.stringify(raw).slice(0, 300)}`
      );
      return [];
    }
    return parsed.data.transactions;
  });

  const categorized: CategorizedTransaction[] = [];
  for (const result of chunkResults.flat()) {
    const txn = txns[result.index];
    if (!txn) continue;
    categorized.push({
      ...txn,
      category: result.category,
      subCategory: result.subCategory,
      merchant: result.merchant,
    });
  }

  return categorized;
}
