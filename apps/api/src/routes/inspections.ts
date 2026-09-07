import { Router } from "express";
import { access } from "node:fs/promises";
import path from "node:path";
import { InspectionType, ProcessStatus } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { resolveManagedFile, saveManagedFile } from "../documents/storage.js";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { inspectionScope, processScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const inspectionsRouter = Router();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype));
  }
});

inspectionsRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const inspections = await prisma.inspection.findMany({
    where: inspectionScope(user),
    orderBy: { createdAt: "desc" },
    include: { process: { include: { enterprise: true, entrepreneur: true } }, attachments: true }
  });
  const fiscalIds = Array.from(new Set(inspections.map((inspection) => inspection.fiscalId)));
  const fiscais = await prisma.user.findMany({ where: { id: { in: fiscalIds } }, select: { id: true, name: true } });
  const fiscalNames = new Map(fiscais.map((fiscal) => [fiscal.id, fiscal.name]));
  return res.json(inspections.map((inspection) => ({
    ...inspection,
    fiscalName: fiscalNames.get(inspection.fiscalId) ?? "Fiscal nao identificado"
  })));
});

inspectionsRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "FISCAL"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const parsed = z.object({
    processId: z.string(),
    fiscalId: z.string(),
    type: z.nativeEnum(InspectionType),
    scheduledAt: z.coerce.date().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    report: z.string().min(5),
    photos: z.array(z.string()).default([])
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados da fiscalizacao invalidos" });

  const fiscalId = user.role === "FISCAL" ? user.id : parsed.data.fiscalId;
  const [process, fiscal] = await Promise.all([
    prisma.process.findFirst({
      where: {
        id: parsed.data.processId,
        ...(user.role === "FISCAL" ? { inspections: { some: { fiscalId: user.id } } } : { AND: [processScope(user)] })
      },
      select: { id: true }
    }),
    prisma.user.findFirst({ where: { id: fiscalId, role: "FISCAL", isActive: true }, select: { id: true } })
  ]);
  if (!process) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!fiscal) return res.status(400).json({ error: "Fiscal invalido" });

  const inspection = await prisma.inspection.create({ data: { ...parsed.data, fiscalId } });
  await prisma.processHistory.create({
    data: {
      processId: parsed.data.processId,
      status: ProcessStatus.EM_ANALISE,
      description: `Vistoria agendada para ${parsed.data.scheduledAt ? parsed.data.scheduledAt.toLocaleDateString("pt-BR") : "data a definir"}.`,
      actorName: user.name
    }
  });
  await recordAudit(user, "INSPECTION_CREATE", "Inspection", inspection.id, {
    processId: parsed.data.processId,
    fiscalId,
    type: parsed.data.type
  });
  return res.status(201).json(inspection);
});

inspectionsRouter.patch("/:id", requireAuth, allowRoles("ADMIN", "ANALISTA", "FISCAL"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    type: z.nativeEnum(InspectionType),
    scheduledAt: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    report: z.string().trim().min(5).max(20000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados da fiscalizacao invalidos", details: parsed.error.flatten() });
  const current = await prisma.inspection.findFirst({ where: { id, AND: [inspectionScope(user)] } });
  if (!current) return res.status(404).json({ error: "Fiscalizacao nao encontrada" });
  const inspection = await prisma.inspection.update({ where: { id }, data: parsed.data });
  await recordAudit(user, "INSPECTION_UPDATE", "Inspection", id, { processId: inspection.processId });
  return res.json(inspection);
});

inspectionsRouter.post("/:id/attachments", requireAuth, allowRoles("ADMIN", "ANALISTA", "FISCAL"), attachmentUpload.array("files", 10), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const inspection = await prisma.inspection.findFirst({ where: { id, AND: [inspectionScope(user)] } });
  if (!inspection) return res.status(404).json({ error: "Fiscalizacao nao encontrada" });
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: "Envie ao menos uma foto ou documento" });

  const attachments = [];
  for (const file of files) {
    const stored = await saveManagedFile("inspections", id, file.originalname, file.buffer);
    const attachment = await prisma.inspectionAttachment.create({
      data: {
        inspectionId: id,
        fileName: stored.fileName,
        filePath: stored.filePath,
        storageKey: stored.storageKey,
        fileSha256: stored.fileSha256,
        fileSizeBytes: stored.fileSizeBytes,
        mimeType: file.mimetype
      }
    });
    attachments.push(attachment);
  }
  await recordAudit(user, "INSPECTION_ATTACHMENTS_UPLOAD", "Inspection", id, {
    processId: inspection.processId,
    count: attachments.length,
    hashes: attachments.map((attachment) => attachment.fileSha256)
  });
  return res.status(201).json(attachments);
});

inspectionsRouter.get("/attachments/:attachmentId/download", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const attachmentId = z.string().min(1).parse(req.params.attachmentId);
  const attachment = await prisma.inspectionAttachment.findFirst({
    where: { id: attachmentId, inspection: inspectionScope(user) }
  });
  const resolved = resolveManagedFile(attachment?.filePath);
  if (!attachment || !resolved) return res.status(404).json({ error: "Anexo nao encontrado" });
  try {
    await access(resolved);
  } catch {
    return res.status(404).json({ error: "Arquivo do anexo nao encontrado" });
  }
  await recordAudit(user, "INSPECTION_ATTACHMENT_DOWNLOAD", "InspectionAttachment", attachmentId, { inspectionId: attachment.inspectionId });
  return res.download(resolved, attachment.fileName || path.basename(resolved));
});

inspectionsRouter.patch("/:id/validate", requireAuth, allowRoles("ADMIN", "ANALISTA", "FISCAL"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const inspectionId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    notes: z.string().trim().min(5).max(4000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe a conclusao da vistoria." });

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, AND: [inspectionScope(user)] },
    include: { process: true }
  });
  if (!inspection) return res.status(404).json({ error: "Vistoria nao encontrada" });
  if (inspection.status === "VALIDADA") return res.status(409).json({ error: "Esta vistoria ja foi validada." });

  const updated = await prisma.inspection.update({
    where: { id: inspection.id },
    data: {
      status: "VALIDADA",
      validatedAt: new Date(),
      validatedBy: user.name,
      validationNotes: parsed.data.notes
    }
  });

  await prisma.processHistory.create({
    data: {
      processId: inspection.processId,
      status: inspection.process.status,
      description: `Vistoria validada: ${parsed.data.notes}`,
      actorName: user.name
    }
  });

  await recordAudit(user, "INSPECTION_VALIDATE", "Inspection", inspection.id, {
    processId: inspection.processId
  });

  return res.json(updated);
});
