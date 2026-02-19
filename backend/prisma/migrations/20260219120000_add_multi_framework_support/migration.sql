-- CreateTable: ComplianceFramework
CREATE TABLE "ComplianceFramework" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "version" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceFramework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFramework_slug_key" ON "ComplianceFramework"("slug");
CREATE INDEX "ComplianceFramework_slug_idx" ON "ComplianceFramework"("slug");
CREATE INDEX "ComplianceFramework_isActive_idx" ON "ComplianceFramework"("isActive");

-- Insert ISO 27001 framework record
INSERT INTO "ComplianceFramework" ("id", "slug", "name", "shortName", "version", "description", "icon", "color", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    'iso27001',
    'ISO/IEC 27001:2022',
    'ISO 27001',
    '2022',
    'Information Security Management System (ISMS) - Requirements for establishing, implementing, maintaining and continually improving an information security management system.',
    'Shield',
    '#3b82f6',
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Step 1: Convert category from enum to string
-- Add temporary string column
ALTER TABLE "Control" ADD COLUMN "category_new" TEXT;

-- Copy existing enum values as strings
UPDATE "Control" SET "category_new" = "category"::text;

-- Drop the old column
ALTER TABLE "Control" DROP COLUMN "category";

-- Rename new column
ALTER TABLE "Control" RENAME COLUMN "category_new" TO "category";

-- Set NOT NULL after population
ALTER TABLE "Control" ALTER COLUMN "category" SET NOT NULL;

-- Drop the enum type (no longer used)
DROP TYPE IF EXISTS "ControlCategory";

-- Step 2: Add frameworkId column to Control
ALTER TABLE "Control" ADD COLUMN "frameworkId" TEXT;

-- Backfill existing ISO 27001 controls with the framework ID
UPDATE "Control" SET "frameworkId" = (SELECT "id" FROM "ComplianceFramework" WHERE "slug" = 'iso27001' LIMIT 1);

-- Add foreign key constraint
ALTER TABLE "Control" ADD CONSTRAINT "Control_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ComplianceFramework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex for frameworkId
CREATE INDEX "Control_frameworkId_idx" ON "Control"("frameworkId");

-- Recreate category index (was on enum, now on string)
DROP INDEX IF EXISTS "Control_category_idx";
CREATE INDEX "Control_category_idx" ON "Control"("category");

-- CreateTable: ChecklistItem
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "guidance" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "evidenceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for ChecklistItem
CREATE INDEX "ChecklistItem_controlId_idx" ON "ChecklistItem"("controlId");
CREATE INDEX "ChecklistItem_organizationId_idx" ON "ChecklistItem"("organizationId");
CREATE INDEX "ChecklistItem_isCompleted_idx" ON "ChecklistItem"("isCompleted");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;
