import { describe, expect, it } from "vitest";
import { extractFileText } from "@/lib/ingestion/parse-file";

// Minimal File polyfill via Node's built-in. node 20+ exposes File globally.
// In test env we can construct a File from a Blob-like wrapper.
function makeFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("extractFileText", () => {
  it("preserves the full body of a long CSV without truncating", async () => {
    // Form 16 / large bank statement CSV exports can run 30K+ chars.
    // The route-level truncation cap (MAX_DOC_CHARS) is the policy layer;
    // extractFileText itself must hand back everything.
    const header = "Date,Description,Amount\n";
    const row = "2026-04-15,UPI-PAYMENT-VENDOR-NAME-LONGER-THAN-USUAL,1234.56\n";
    const body = header + row.repeat(1000); // ~60K chars
    const file = makeFile("statement.csv", body);

    const text = await extractFileText(file);

    expect(text.length).toBeGreaterThan(50_000);
    expect(text.startsWith(header)).toBe(true);
    expect(text.endsWith(row)).toBe(true);
  });

  it("strips HTML tags but keeps visible text", async () => {
    const html = "<html><body><p>Hello <b>world</b></p><script>secret()</script></body></html>";
    const file = new File([html], "page.html", { type: "text/html" });

    const text = await extractFileText(file);

    expect(text).toContain("Hello");
    expect(text).toContain("world");
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("secret()");
  });

  it("returns text content for txt files", async () => {
    const content = "Plain text content for tax document.";
    const file = makeFile("notes.txt", content);

    const text = await extractFileText(file);

    expect(text).toBe(content);
  });
});
