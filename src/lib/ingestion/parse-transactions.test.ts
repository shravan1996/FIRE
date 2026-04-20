import { describe, expect, it } from "vitest";
import { parseCSV } from "@/lib/ingestion/parse-transactions";

describe("parseCSV", () => {
  it("parses debit/credit style bank exports", () => {
    const csv = [
      "Date,Narration,Debit,Credit",
      "01/04/2026,UPI-FOOD-ORDER,450,",
      "02/04/2026,SALARY,,150000",
    ].join("\n");

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toContain("UPI-FOOD-ORDER");
    expect(rows[0].type).toBe("debit");
    expect(rows[0].amount).toBe(450);
    expect(rows[1].type).toBe("credit");
    expect(rows[1].amount).toBe(150000);
  });

  it("parses signed amount exports", () => {
    const csv = [
      "Transaction Date,Description,Amount",
      "2026-04-10,ATM Withdrawal,-2000",
      "2026-04-11,Dividend,1200",
    ].join("\n");

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("debit");
    expect(rows[0].amount).toBe(2000);
    expect(rows[1].type).toBe("credit");
    expect(rows[1].amount).toBe(1200);
  });

  it("throws when required columns are missing", () => {
    const badCsv = ["foo,bar,baz", "1,2,3"].join("\n");
    expect(() => parseCSV(badCsv)).toThrow(
      "CSV must have date and description/narration columns."
    );
  });
});
