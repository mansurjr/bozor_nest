-- DropForeignKey
ALTER TABLE "public"."Section" DROP CONSTRAINT "Section_assignedCheckerId_fkey";

-- AlterTable
ALTER TABLE "Section" ALTER COLUMN "assignedCheckerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_assignedCheckerId_fkey" FOREIGN KEY ("assignedCheckerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
