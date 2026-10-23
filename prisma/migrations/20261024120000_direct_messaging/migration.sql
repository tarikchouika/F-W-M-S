-- DirectMessage: المراسلة المرئية والموقعية بين المستخدمين (بلاغ المالك 2026-10-24)
-- نفس نموذج عزل الصوتيات (فريق مشترك أو إشراف) — الحمولة BLOB للموقع null

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "lat" REAL,
    "lng" REAL,
    "accuracyM" REAL,
    "media" BLOB,
    "viewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DirectMessage_companyId_groupId_createdAt_idx" ON "DirectMessage"("companyId", "groupId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_recipientId_viewedAt_idx" ON "DirectMessage"("recipientId", "viewedAt");
