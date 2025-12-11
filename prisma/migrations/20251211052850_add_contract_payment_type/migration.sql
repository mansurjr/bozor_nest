-- CreateEnum
CREATE TYPE "ContractPaymentType" AS ENUM ('ONLINE', 'BANK_ONLY');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "paymentType" "ContractPaymentType" NOT NULL DEFAULT 'ONLINE';
