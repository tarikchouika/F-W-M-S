-- CreateTable
CREATE TABLE "JobSeeker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "emailVerifiedAt" DATETIME,
    "phoneVerifiedAt" DATETIME,
    "documentType" TEXT,
    "documentName" TEXT,
    "documentMime" TEXT,
    "documentBytes" BLOB,
    "documentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "sessionsInvalidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'seeker_register',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProjectVacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "closesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectVacancy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectVacancy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VacancyApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacancyId" TEXT NOT NULL,
    "seekerId" TEXT NOT NULL,
    "coverNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VacancyApplication_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "ProjectVacancy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VacancyApplication_seekerId_fkey" FOREIGN KEY ("seekerId") REFERENCES "JobSeeker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSeeker_email_key" ON "JobSeeker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JobSeeker_phone_key" ON "JobSeeker"("phone");

-- CreateIndex
CREATE INDEX "JobSeeker_status_idx" ON "JobSeeker"("status");

-- CreateIndex
CREATE INDEX "JobSeeker_isActive_idx" ON "JobSeeker"("isActive");

-- CreateIndex
CREATE INDEX "OtpCode_channel_target_idx" ON "OtpCode"("channel", "target");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE INDEX "ProjectVacancy_companyId_status_idx" ON "ProjectVacancy"("companyId", "status");

-- CreateIndex
CREATE INDEX "ProjectVacancy_projectId_idx" ON "ProjectVacancy"("projectId");

-- CreateIndex
CREATE INDEX "ProjectVacancy_status_publishedAt_idx" ON "ProjectVacancy"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "VacancyApplication_vacancyId_status_idx" ON "VacancyApplication"("vacancyId", "status");

-- CreateIndex
CREATE INDEX "VacancyApplication_seekerId_idx" ON "VacancyApplication"("seekerId");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyApplication_vacancyId_seekerId_key" ON "VacancyApplication"("vacancyId", "seekerId");

-- ── هجرة البيانات (إعادة التسمية FWMS → HRMP — أمر المالك 2026-10-24) ──
-- مالك المنصة القائم في بيئات الإنتاج يعرض الاسم القديم من القاعدة (white-label):
-- يُحدَّث الاسم المعروض والقانوني حيث كانا يحملان الاسم القديم حصرًا — لا يُمسّ
-- أي مالك خصّص اسمه بنفسه عبر لوحة /dashboard/platform (بيانات مالك ليست للمنصة).
UPDATE "PlatformOwner"
SET "displayName" = 'HRMP',
    "legalName"   = REPLACE("legalName", 'FWMS', 'HRMP'),
    "updatedAt"   = CURRENT_TIMESTAMP
WHERE "displayName" = 'FWMS';

-- التوثيق داخل الترقيم التسلسلي للهجرة فقط — لا حاجة لتغييرات أخرى على البيانات:
-- الوظائف والباحثون جداول جديدة تبدأ فارغة، وكل إيميلات البذور (owner@fwms.local)
-- معرّفات دخول مستقرة تبقى كما هي بقرار موثَّق (KNOWLEDGE_BASE §إعادة التسمية).
