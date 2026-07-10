CREATE TABLE "ProcessSequence" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessSequence_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "LicenseRule" (
    "id" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "deadlineDays" INTEGER NOT NULL DEFAULT 30,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "requiresInspection" BOOLEAN NOT NULL DEFAULT false,
    "requiredDocuments" TEXT[],
    "legalBasis" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LicenseRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseRule_licenseType_key" ON "LicenseRule"("licenseType");

ALTER TABLE "Document"
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "fileSha256" TEXT,
ADD COLUMN "fileSizeBytes" INTEGER,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "IssuedDocument"
ADD COLUMN "validationCode" TEXT;

CREATE UNIQUE INDEX "IssuedDocument_validationCode_key" ON "IssuedDocument"("validationCode");

ALTER TABLE "AuditLog"
ADD COLUMN "requestId" TEXT,
ADD COLUMN "ip" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "before" JSONB,
ADD COLUMN "after" JSONB;
