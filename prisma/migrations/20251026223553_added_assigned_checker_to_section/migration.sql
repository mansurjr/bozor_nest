/*
  Warnings:

  - Added the required column `assignedCheckerId` to the `Section` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "assignedCheckerId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_assignedCheckerId_fkey" FOREIGN KEY ("assignedCheckerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
