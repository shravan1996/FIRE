import { spawn } from "child_process";

// Strip markdown JSON fences Claude may wrap around JSON responses
function extractText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

/**
 * Send a single-turn prompt to Claude via the Claude Code CLI.
 * Uses the authenticated Claude Code session — no API key required.
 *
 * The CLAUDECODE env var is unset so the subprocess is not treated as a
 * nested Claude Code session (which would error).
 */
export async function claudeComplete(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Strip CLAUDECODE so the child process doesn't see itself as nested
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn(
      "claude",
      [
        "--print",
        "--output-format", "json",
        "--tools", "",
        "--permission-mode", "bypassPermissions",
        "--no-session-persistence",
        "--system-prompt", systemPrompt,
      ],
      { env }
    );

    // Send user prompt via stdin to handle long prompts safely
    child.stdin.write(userPrompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.type === "result" && parsed.subtype === "success") {
          resolve(extractText(String(parsed.result)));
        } else {
          reject(new Error(`Claude returned non-success result: ${stdout.slice(0, 200)}`));
        }
      } catch {
        // Output wasn't JSON — treat raw stdout as the response text
        resolve(extractText(stdout));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

