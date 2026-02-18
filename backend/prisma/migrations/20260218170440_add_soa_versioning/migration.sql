-- CreateEnum
CREATE TYPE "SoAStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "SoAEntry" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "controlOwner" TEXT,
ADD COLUMN     "controlSource" TEXT NOT NULL DEFAULT 'Annex A ISO 27001:2022',
ADD COLUMN     "documentationReferences" TEXT,
ADD COLUMN     "status" "SoAStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "version" DOUBLE PRECISION NOT NULL DEFAULT 0.1;

-- CreateTable
CREATE TABLE "SoAVersion" (
    "id" TEXT NOT NULL,
    "soaEntryId" TEXT NOT NULL,
    "version" DOUBLE PRECISION NOT NULL,
    "changeDescription" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorDesignation" TEXT,
    "action" TEXT NOT NULL,
    "soaData" JSONB NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoAVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoAVersion_soaEntryId_idx" ON "SoAVersion"("soaEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SoAVersion_soaEntryId_version_key" ON "SoAVersion"("soaEntryId", "version");

-- CreateIndex
CREATE INDEX "SoAEntry_approvalStatus_idx" ON "SoAEntry"("approvalStatus");

-- AddForeignKey
ALTER TABLE "SoAVersion" ADD CONSTRAINT "SoAVersion_soaEntryId_fkey" FOREIGN KEY ("soaEntryId") REFERENCES "SoAEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
