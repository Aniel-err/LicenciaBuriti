-- Extend PostgreSQL with geographic support required by enterprises and inspections.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "ConditionStatus" AS ENUM ('PENDENTE', 'EM_CUMPRIMENTO', 'CUMPRIDA', 'VENCIDA');
CREATE TYPE "NotificationType" AS ENUM ('PRAZO_PROCESSO', 'DOCUMENTO', 'CONDICIONANTE', 'LICENCA', 'SISTEMA');
CREATE TYPE "InstitutionalContentType" AS ENUM ('MANUAL', 'LEGISLACAO');

ALTER TABLE "TechnicalManager"
  ADD COLUMN "enterpriseId" TEXT,
  ADD COLUMN "council" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Enterprise"
  ADD COLUMN "district" TEXT,
  ADD COLUMN "zone" TEXT NOT NULL DEFAULT 'URBANA';

ALTER TABLE "Activity"
  ADD COLUMN "legalBasis" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Process"
  ADD COLUMN "renewalOfId" TEXT;

ALTER TABLE "IssuedDocument"
  ADD COLUMN "fileName" TEXT,
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "fileSha256" TEXT,
  ADD COLUMN "signature" TEXT,
  ADD COLUMN "signatureAlgorithm" TEXT,
  ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  ADD COLUMN "signedAt" TIMESTAMP(3);

ALTER TABLE "Condition"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ConditionStatus" USING ("status"::"ConditionStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PENDENTE',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "DocumentSequence" (
  "year" INTEGER NOT NULL,
  "prefix" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("year", "prefix")
);

CREATE TABLE "InspectionAttachment" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileSha256" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstitutionalContent" (
  "id" TEXT NOT NULL,
  "type" "InstitutionalContentType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "reference" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "processId" TEXT,
  "conditionId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

CREATE INDEX "TechnicalManager_entrepreneurId_idx" ON "TechnicalManager"("entrepreneurId");
CREATE INDEX "TechnicalManager_enterpriseId_idx" ON "TechnicalManager"("enterpriseId");
CREATE INDEX "Enterprise_entrepreneurId_idx" ON "Enterprise"("entrepreneurId");
CREATE INDEX "Enterprise_activityId_idx" ON "Enterprise"("activityId");
CREATE INDEX "Enterprise_district_idx" ON "Enterprise"("district");
CREATE INDEX "Enterprise_zone_idx" ON "Enterprise"("zone");
CREATE INDEX "Process_status_idx" ON "Process"("status");
CREATE INDEX "Process_licenseType_idx" ON "Process"("licenseType");
CREATE INDEX "Process_analystId_idx" ON "Process"("analystId");
CREATE INDEX "Process_openedAt_idx" ON "Process"("openedAt");
CREATE INDEX "Process_dueDate_idx" ON "Process"("dueDate");
CREATE INDEX "Process_renewalOfId_idx" ON "Process"("renewalOfId");
CREATE INDEX "Document_processId_idx" ON "Document"("processId");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "IssuedDocument_processId_idx" ON "IssuedDocument"("processId");
CREATE INDEX "IssuedDocument_type_idx" ON "IssuedDocument"("type");
CREATE INDEX "IssuedDocument_validUntil_idx" ON "IssuedDocument"("validUntil");
CREATE INDEX "Opinion_processId_idx" ON "Opinion"("processId");
CREATE INDEX "Opinion_authorId_idx" ON "Opinion"("authorId");
CREATE INDEX "Condition_processId_idx" ON "Condition"("processId");
CREATE INDEX "Condition_status_idx" ON "Condition"("status");
CREATE INDEX "Condition_dueDate_idx" ON "Condition"("dueDate");
CREATE INDEX "Inspection_processId_idx" ON "Inspection"("processId");
CREATE INDEX "Inspection_fiscalId_idx" ON "Inspection"("fiscalId");
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");
CREATE INDEX "Inspection_scheduledAt_idx" ON "Inspection"("scheduledAt");
CREATE INDEX "InspectionAttachment_inspectionId_idx" ON "InspectionAttachment"("inspectionId");
CREATE INDEX "Fee_activityId_idx" ON "Fee"("activityId");
CREATE INDEX "InstitutionalContent_type_idx" ON "InstitutionalContent"("type");
CREATE INDEX "InstitutionalContent_isPublished_idx" ON "InstitutionalContent"("isPublished");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_processId_idx" ON "Notification"("processId");
CREATE INDEX "Notification_dueAt_idx" ON "Notification"("dueAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "TechnicalManager"
  ADD CONSTRAINT "TechnicalManager_enterpriseId_fkey"
  FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Process"
  ADD CONSTRAINT "Process_renewalOfId_fkey"
  FOREIGN KEY ("renewalOfId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Opinion"
  ADD CONSTRAINT "Opinion_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionAttachment"
  ADD CONSTRAINT "InspectionAttachment_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_processId_fkey"
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_conditionId_fkey"
  FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Generated geography columns remain managed by SQL while Prisma keeps the editable
-- latitude and longitude decimals. They enable indexed spatial queries through raw SQL.
ALTER TABLE "Enterprise"
  ADD COLUMN "locationGeo" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
    END
  ) STORED;

ALTER TABLE "Inspection"
  ADD COLUMN "locationGeo" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
    END
  ) STORED;

CREATE INDEX "Enterprise_locationGeo_gist" ON "Enterprise" USING GIST ("locationGeo");
CREATE INDEX "Inspection_locationGeo_gist" ON "Inspection" USING GIST ("locationGeo");
