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

// Known Indian bank CSV column mappings
const DATE_KEYS = ["date", "txn date", "transaction date", "value date", "posting date"];
const DESC_KEYS = ["description", "narration", "particulars", "remarks", "txn remarks"];
const DEBIT_KEYS = ["debit", "withdrawal", "dr", "debit amount", "withdrawal amt"];
const CREDIT_KEYS = ["credit", "deposit", "cr", "credit amount", "deposit amt"];
const AMOUNT_KEYS = ["amount", "transaction amount"];

function normalizeKey(k: string) {
  return k.toLowerCase().trim();
}

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const h of headers) {
    if (candidates.includes(normalizeKey(h))) return h;
  }
  return null;
}

function parseIndianDate(raw: string): Date | null {
  // dd/mm/yyyy, dd-mm-yyyy, dd MMM yyyy, yyyy-mm-dd
  const clean = raw.trim();
  const formats = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // dd/mm/yyyy
    /^(\d{2})-(\d{2})-(\d{4})$/, // dd-mm-yyyy
    /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-mm-dd
  ];

  for (const fmt of formats) {
    const m = clean.match(fmt);
    if (m) {
      const [, a, b, c] = m;
      // Detect ISO vs DMY
      const year = a.length === 4 ? parseInt(a) : parseInt(c);
      const month = a.length === 4 ? parseInt(b) - 1 : parseInt(b) - 1;
      const day = a.length === 4 ? parseInt(c) : parseInt(a);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try natural parsing as fallback
  const natural = new Date(clean);
  return isNaN(natural.getTime()) ? null : natural;
}

export function parseCSV(csvText: string): RawTransaction[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length && result.data.length === 0) {
    throw new Error(`CSV parse failed: ${result.errors[0].message}`);
  }

  const headers = result.meta.fields ?? [];
  const dateCol = findColumn(headers, DATE_KEYS);
  const descCol = findColumn(headers, DESC_KEYS);
  const debitCol = findColumn(headers, DEBIT_KEYS);
  const creditCol = findColumn(headers, CREDIT_KEYS);
  const amountCol = findColumn(headers, AMOUNT_KEYS);

  if (!dateCol || !descCol) {
    throw new Error("CSV must have date and description/narration columns.");
  }

  const transactions: RawTransaction[] = [];

  for (const row of result.data) {
    const date = parseIndianDate(row[dateCol] ?? "");
    if (!date) continue;

    const description = row[descCol]?.trim() ?? "";
    if (!description) continue;

    let amount = 0;
    let type: "credit" | "debit" = "debit";

    if (debitCol && creditCol) {
      const debit = parseFloat((row[debitCol] ?? "").replace(/[,₹\s]/g, "")) || 0;
      const credit = parseFloat((row[creditCol] ?? "").replace(/[,₹\s]/g, "")) || 0;
      if (debit > 0) { amount = debit; type = "debit"; }
      else if (credit > 0) { amount = credit; type = "credit"; }
      else continue;
    } else if (amountCol) {
      const raw = (row[amountCol] ?? "").replace(/[,₹\s]/g, "");
      amount = Math.abs(parseFloat(raw)) || 0;
      type = parseFloat(raw) < 0 ? "debit" : "credit";
    } else {
      continue;
    }

    if (amount === 0) continue;

    transactions.push({
      date,
      description,
      amount,
      type,
      rawData: JSON.stringify(row),
    });
  }

  return transactions;
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

export async function categorizeTransactions(
  txns: RawTransaction[]
): Promise<CategorizedTransaction[]> {
  if (txns.length === 0) return [];

  const CHUNK = 40;
  const offsets: number[] = [];
  for (let i = 0; i < txns.length; i += CHUNK) offsets.push(i);

  const chunkResults = await Promise.all(
    offsets.map(async (offset) => {
      const chunk = txns.slice(offset, offset + CHUNK);
      const payload = chunk.map((t, idx) => ({
        index: offset + idx,
        description: t.description,
        amount: t.amount,
        type: t.type,
      }));

      try {
        const raw = JSON.parse(
          await claudeComplete(CATEGORIZATION_SYSTEM, JSON.stringify(payload))
        );
        const parsed = CategorizationResultSchema.safeParse(raw);
        return parsed.success ? parsed.data.transactions : [];
      } catch {
        return [];
      }
    })
  );

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
