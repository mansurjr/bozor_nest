/*
  Warnings:

  - A unique constraint covering the columns `[stallNumber]` on the table `Stall` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Stall" ADD COLUMN     "stallNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Stall_stallNumber_key" ON "Stall"("stallNumber");
