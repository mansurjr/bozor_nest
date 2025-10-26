-- AlterTable
ALTER TABLE "Stall" ADD COLUMN     "click_payment_url" TEXT,
ADD COLUMN     "payme_payment_url" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "click_payment_url" TEXT,
ADD COLUMN     "payme_payment_url" TEXT;
