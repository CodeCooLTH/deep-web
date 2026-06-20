-- CreateTable
CREATE TABLE "ScamReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scamType" TEXT NOT NULL,
    "amountLost" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScamReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScamReportIdentifier" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "valueMasked" TEXT NOT NULL,
    "bankName" TEXT,

    CONSTRAINT "ScamReportIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScamReport_status_idx" ON "ScamReport"("status");

-- CreateIndex
CREATE INDEX "ScamReportIdentifier_type_valueHash_idx" ON "ScamReportIdentifier"("type", "valueHash");

-- AddForeignKey
ALTER TABLE "ScamReport" ADD CONSTRAINT "ScamReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScamReport" ADD CONSTRAINT "ScamReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScamReportIdentifier" ADD CONSTRAINT "ScamReportIdentifier_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ScamReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
