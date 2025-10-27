-- CreateTable
CREATE TABLE "ClickTransaction" (
    "id" SERIAL NOT NULL,
    "clickTransId" TEXT NOT NULL,
    "clickPaydocId" TEXT,
    "merchantTransId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "action" INTEGER NOT NULL,
    "signTime" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "error" INTEGER NOT NULL DEFAULT 0,
    "errorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClickTransaction_clickTransId_key" ON "ClickTransaction"("clickTransId");
