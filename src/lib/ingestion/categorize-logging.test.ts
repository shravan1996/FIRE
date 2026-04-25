import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Claude subprocess client BEFORE importing the module under test.
// `categorizeTransactions` previously swallowed every failure mode silently and
// returned []. These tests exist to make sure each failure mode now logs a
// useful diagnostic instead — the regression we are guarding against is going
// back to a silent catch.
vi.mock("@/lib/ai-client", () => ({
  claudeComplete: vi.fn(),
}));

import { claudeComplete } from "@/lib/ai-client";
import { categorizeTransactions, type RawTransaction } from "@/lib/ingestion/parse-transactions";

const claudeMock = claudeComplete as unknown as ReturnType<typeof vi.fn>;

function txn(description: string, amount: number): RawTransaction {
  return {
    date: new Date("2026-04-15"),
    description,
    amount,
    type: amount > 0 ? "credit" : "debit",
    rawData: "{}",
  };
}

describe("categorizeTransactions logging", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    claudeMock.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("logs and returns [] when claude throws", async () => {
    claudeMock.mockRejectedValue(new Error("subprocess crashed"));

    const result = await categorizeTransactions([txn("UPI-FOOD", -450)]);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toMatch(/claudeComplete failed/);
    expect(logged).toMatch(/subprocess crashed/);
  });

  it("logs and returns [] when claude returns non-JSON prose", async () => {
    claudeMock.mockResolvedValue("Here are the categorisations: ...");

    const result = await categorizeTransactions([txn("UPI-FOOD", -450)]);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toMatch(/JSON\.parse failed/);
    // The first 300 chars of the bad response should appear in the log so we
    // can see exactly what claude returned without re-running the upload.
    expect(logged).toMatch(/Here are the categorisations/);
  });

  it("logs and returns [] when claude returns JSON in the wrong shape", async () => {
    claudeMock.mockResolvedValue(JSON.stringify({ unexpected: "shape" }));

    const result = await categorizeTransactions([txn("UPI-FOOD", -450)]);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toMatch(/schema validation failed/);
  });

  it("returns parsed transactions when claude responds correctly", async () => {
    claudeMock.mockResolvedValue(
      JSON.stringify({
        transactions: [
          { index: 0, category: "wants", subCategory: "food_delivery", merchant: "Swiggy" },
        ],
      })
    );

    const result = await categorizeTransactions([txn("UPI-FOOD", -450)]);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("wants");
    expect(result[0].merchant).toBe("Swiggy");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
