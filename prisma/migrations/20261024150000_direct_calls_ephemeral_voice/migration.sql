-- AlterTable
ALTER TABLE "VoiceMessage" ADD COLUMN "purgedAt" DATETIME;
ALTER TABLE "VoiceMessage" ADD COLUMN "purgedBy" TEXT;

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "media" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallSession_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallSession_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CallSession_companyId_createdAt_idx" ON "CallSession"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_calleeId_status_createdAt_idx" ON "CallSession"("calleeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CallSignal_toUserId_createdAt_idx" ON "CallSignal"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CallSignal_createdAt_idx" ON "CallSignal"("createdAt");

-- CreateIndex
CREATE INDEX "VoiceMessage_purgedAt_idx" ON "VoiceMessage"("purgedAt");

