-- CreateTable
CREATE TABLE "SkillRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "editor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SkillRevision_skillName_createdAt_idx" ON "SkillRevision"("skillName", "createdAt");
