-- DropForeignKey
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_ownerId_fkey";

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
