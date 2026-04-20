import path from "node:path";

export const SKILL_CATALOG = [
  { key: "market-researcher", label: "Market Researcher", fileName: "market-researcher.md" },
  { key: "accountant", label: "Accountant", fileName: "accountant.md" },
  { key: "investment-manager", label: "Investment Manager", fileName: "investment-manager.md" },
  { key: "tax-analyst", label: "Tax Analyst", fileName: "tax-analyst.md" },
  { key: "finance-friend", label: "Finance Friend", fileName: "finance-friend.md" },
] as const;

export type SkillKey = (typeof SKILL_CATALOG)[number]["key"];

export function isSkillKey(value: string): value is SkillKey {
  return SKILL_CATALOG.some((skill) => skill.key === value);
}

export function getSkillPath(skillKey: SkillKey): string {
  const skill = SKILL_CATALOG.find((item) => item.key === skillKey);
  if (!skill) {
    throw new Error(`Unknown skill key: ${skillKey}`);
  }
  return path.join(process.cwd(), "skills", skill.fileName);
}
