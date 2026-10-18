-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN "jobTitleCustom" TEXT;
ALTER TABLE "EmployeeProfile" ADD COLUMN "jobTitleKey" TEXT;

-- CreateTable
CREATE TABLE "WorkerGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitleKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,
    "removedAt" DATETIME,
    CONSTRAINT "WorkerGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkerGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberLocationPing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT,
    "userId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "accuracyM" REAL,
    "source" TEXT NOT NULL DEFAULT 'watcher',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberLocationPing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT NOT NULL DEFAULT 'audio/webm',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "audio" BLOB NOT NULL,
    "listenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoiceMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PermissionDelegation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "grantorId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "note" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "PermissionDelegation_grantorId_fkey" FOREIGN KEY ("grantorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PermissionDelegation_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkerGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "kind" TEXT NOT NULL DEFAULT 'regular',
    "leaderUserId" TEXT,
    "siteId" TEXT,
    "zoneLat" REAL,
    "zoneLng" REAL,
    "zoneRadiusM" INTEGER DEFAULT 150,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkerGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerGroup_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkerGroup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkerGroup" ("companyId", "createdAt", "description", "id", "name", "status", "updatedAt") SELECT "companyId", "createdAt", "description", "id", "name", "status", "updatedAt" FROM "WorkerGroup";
DROP TABLE "WorkerGroup";
ALTER TABLE "new_WorkerGroup" RENAME TO "WorkerGroup";
CREATE INDEX "WorkerGroup_companyId_status_idx" ON "WorkerGroup"("companyId", "status");
CREATE INDEX "WorkerGroup_companyId_kind_idx" ON "WorkerGroup"("companyId", "kind");
CREATE INDEX "WorkerGroup_leaderUserId_idx" ON "WorkerGroup"("leaderUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WorkerGroupMember_groupId_status_idx" ON "WorkerGroupMember"("groupId", "status");

-- CreateIndex
CREATE INDEX "WorkerGroupMember_companyId_userId_status_idx" ON "WorkerGroupMember"("companyId", "userId", "status");

-- CreateIndex
CREATE INDEX "MemberLocationPing_companyId_userId_reportedAt_idx" ON "MemberLocationPing"("companyId", "userId", "reportedAt");

-- CreateIndex
CREATE INDEX "MemberLocationPing_groupId_reportedAt_idx" ON "MemberLocationPing"("groupId", "reportedAt");

-- CreateIndex
CREATE INDEX "VoiceMessage_companyId_groupId_createdAt_idx" ON "VoiceMessage"("companyId", "groupId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceMessage_recipientId_listenedAt_idx" ON "VoiceMessage"("recipientId", "listenedAt");

-- CreateIndex
CREATE INDEX "PermissionDelegation_companyId_granteeId_idx" ON "PermissionDelegation"("companyId", "granteeId");

-- CreateIndex
CREATE INDEX "PermissionDelegation_companyId_grantorId_idx" ON "PermissionDelegation"("companyId", "grantorId");
