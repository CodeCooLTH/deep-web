-- CreateTable
CREATE TABLE "AiSuggestRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "anchorMessageId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT,
    "suggestion" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "firedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "feedbackReason" TEXT,
    "feedbackNote" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiSuggestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSuggestRun_createdAt_idx" ON "AiSuggestRun"("createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestRun_shopId_createdAt_idx" ON "AiSuggestRun"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestRun_conversationId_createdAt_idx" ON "AiSuggestRun"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestRun_firedAt_idx" ON "AiSuggestRun"("firedAt");

-- CreateIndex
CREATE INDEX "AiSuggestRun_shopId_firedAt_idx" ON "AiSuggestRun"("shopId", "firedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSuggestRun_conversationId_anchorMessageId_attempt_key" ON "AiSuggestRun"("conversationId", "anchorMessageId", "attempt");
