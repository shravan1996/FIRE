import { readFile } from "node:fs/promises";
import path from "node:path";

const skillCache = new Map<string, string>();

export async function loadAgentSkill(skillName: string, fallback: string): Promise<string> {
  if (skillCache.has(skillName)) {
    return skillCache.get(skillName)!;
  }

  const skillPath = path.join(process.cwd(), "skills", `${skillName}.md`);

  try {
    const content = await readFile(skillPath, "utf8");
    const trimmed = content.trim();
    const resolved = trimmed.length > 0 ? trimmed : fallback;
    skillCache.set(skillName, resolved);
    return resolved;
  } catch {
    skillCache.set(skillName, fallback);
    return fallback;
  }
}
