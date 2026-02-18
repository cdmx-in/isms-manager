/*
  Warnings:

  - You are about to drop the column `inherentImpact` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `inherentProbability` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `inherentRiskScore` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `isRetired` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `lastReviewedOn` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `residualRiskScore` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `retirementDate` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `retirementReason` on the `Risk` table. All the data in the column will be lost.
  - You are about to drop the column `treatmentDays` on the `Risk` table. All the data in the column will be lost.
  - The `inherentRisk` column on the `Risk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `residualProbability` column on the `Risk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `residualImpact` column on the `Risk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `residualRisk` column on the `Risk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `treatment` column on the `Risk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `description` on the `RiskVersion` table. All the data in the column will be lost.
  - You are about to drop the `RiskTreatmentRecord` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `changeDescription` to the `RiskVersion` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RiskTreatmentType" AS ENUM ('ACCEPT', 'MITIGATE', 'TRANSFER', 'AVOID', 'PENDING');

-- DropForeignKey
ALTER TABLE "RiskTreatmentRecord" DROP CONSTRAINT "RiskTreatmentRecord_riskId_fkey";

-- DropIndex
DROP INDEX "Risk_treatment_idx";

-- AlterTable
ALTER TABLE "Risk" DROP COLUMN "inherentImpact",
DROP COLUMN "inherentProbability",
DROP COLUMN "inherentRiskScore",
DROP COLUMN "isRetired",
DROP COLUMN "lastReviewedOn",
DROP COLUMN "residualRiskScore",
DROP COLUMN "retirementDate",
DROP COLUMN "retirementReason",
DROP COLUMN "treatmentDays",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
DROP COLUMN "inherentRisk",
ADD COLUMN     "inherentRisk" INTEGER,
DROP COLUMN "residualProbability",
ADD COLUMN     "residualProbability" INTEGER,
DROP COLUMN "residualImpact",
ADD COLUMN     "residualImpact" INTEGER,
DROP COLUMN "residualRisk",
ADD COLUMN     "residualRisk" INTEGER,
DROP COLUMN "treatment",
ADD COLUMN     "treatment" "RiskTreatmentType" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "RiskVersion" DROP COLUMN "description",
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "changeDescription" TEXT NOT NULL,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "designation" TEXT;

-- DropTable
DROP TABLE "RiskTreatmentRecord";

-- DropEnum
DROP TYPE "RiskTreatment";

-- CreateTable
CREATE TABLE "RiskTreatment" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "residualProbability" INTEGER NOT NULL,
    "residualImpact" INTEGER NOT NULL,
    "residualRisk" INTEGER NOT NULL,
    "riskResponse" TEXT NOT NULL,
    "controlDescription" TEXT,
    "controlImplementationDate" TIMESTAMP(3),
    "treatmentTimeInDays" INTEGER,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRetirement" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "retiredById" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRetirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskTreatment_riskId_idx" ON "RiskTreatment"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskRetirement_riskId_key" ON "RiskRetirement"("riskId");

-- CreateIndex
CREATE INDEX "RiskRetirement_riskId_idx" ON "RiskRetirement"("riskId");

-- CreateIndex
CREATE INDEX "RiskRetirement_retiredById_idx" ON "RiskRetirement"("retiredById");

-- AddForeignKey
ALTER TABLE "RiskTreatment" ADD CONSTRAINT "RiskTreatment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRetirement" ADD CONSTRAINT "RiskRetirement_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRetirement" ADD CONSTRAINT "RiskRetirement_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
