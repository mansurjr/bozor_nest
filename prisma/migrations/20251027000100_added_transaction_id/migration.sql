/*
  Warnings:

  - A unique constraint covering the columns `[transactionId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "transactionId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_transactionId_key" ON "Attendance"("transactionId");
