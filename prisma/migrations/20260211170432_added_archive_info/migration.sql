-- DropForeignKey
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_createdById_fkey";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" INTEGER;

-- AlterTable
ALTER TABLE "Owner" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
