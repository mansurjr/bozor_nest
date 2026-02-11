-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fiscalErrorCode" INTEGER,
ADD COLUMN     "fiscalErrorNote" TEXT,
ADD COLUMN     "fiscalQrCode" TEXT;
