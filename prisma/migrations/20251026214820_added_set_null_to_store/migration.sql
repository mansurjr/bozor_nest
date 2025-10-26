/*
  Warnings:

  - You are about to drop the column `storeId` on the `Section` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Section" DROP CONSTRAINT "Section_storeId_fkey";

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "storeId";

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "sectionId" INTEGER;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
