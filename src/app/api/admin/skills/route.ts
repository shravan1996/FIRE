import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getSkillPath,
  isSkillKey,
  SKILL_CATALOG,
  type SkillKey,
} from "@/lib/advisor/skills/catalog";

const UpdateSkillSchema = z.object({
  skillKey: z.string(),
  content: z.string().min(1),
  summary: z.string().max(200).optional(),
  editor: z.string().max(100).optional(),
});

async function readSkillContent(skillKey: SkillKey): Promise<string> {
  const filePath = getSkillPath(skillKey);
  const content = await readFile(filePath, "utf8");
  return content;
}

export async function GET(req: NextRequest) {
  const skillKeyParam = req.nextUrl.searchParams.get("skillKey");

  if (skillKeyParam) {
    if (!isSkillKey(skillKeyParam)) {
      return NextResponse.json({ error: "Invalid skill key" }, { status: 400 });
    }

    const [content, revisions] = await Promise.all([
      readSkillContent(skillKeyParam),
      prisma.skillRevision.findMany({
        where: { skillName: skillKeyParam },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      skill: {
        key: skillKeyParam,
        content,
      },
      revisions,
    });
  }

  const catalogWithPreview = await Promise.all(
    SKILL_CATALOG.map(async (skill) => {
      const content = await readSkillContent(skill.key);
      return {
        key: skill.key,
        label: skill.label,
        preview: content.slice(0, 140).replace(/\s+/g, " ").trim(),
      };
    })
  );

  return NextResponse.json({ skills: catalogWithPreview });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpdateSkillSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { skillKey, content, summary, editor } = parsed.data;
    if (!isSkillKey(skillKey)) {
      return NextResponse.json({ error: "Invalid skill key" }, { status: 400 });
    }

    const filePath = getSkillPath(skillKey);
    await writeFile(filePath, `${content.trimEnd()}\n`, "utf8");

    const revision = await prisma.skillRevision.create({
      data: {
        skillName: skillKey,
        content: content.trimEnd(),
        summary: summary ?? null,
        editor: editor ?? null,
      },
    });

    return NextResponse.json({ success: true, revision });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update skill" },
      { status: 500 }
    );
  }
}
