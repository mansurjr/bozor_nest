-- CreateEnum
CREATE TYPE "ContractPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REVERSED');

-- CreateTable
CREATE TABLE "ContractPaymentPeriod" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ContractPaymentStatus" NOT NULL DEFAULT 'PAID',
    "amount" DECIMAL(65,30),
    "transactionId" INTEGER,
    "createdById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPaymentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractPaymentPeriod_contractId_periodStart_key" ON "ContractPaymentPeriod"("contractId", "periodStart");

-- AddForeignKey
ALTER TABLE "ContractPaymentPeriod" ADD CONSTRAINT "ContractPaymentPeriod_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPaymentPeriod" ADD CONSTRAINT "ContractPaymentPeriod_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPaymentPeriod" ADD CONSTRAINT "ContractPaymentPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

