-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "cancelTime" TIMESTAMP(3),
ADD COLUMN     "performTime" TIMESTAMP(3),
ADD COLUMN     "prepareId" INTEGER,
ADD COLUMN     "reason" INTEGER,
ADD COLUMN     "state" INTEGER;
