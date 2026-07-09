import { Router } from "express";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { DocumentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { canChangeProcess, processScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      callback(new Error("Somente arquivos PDF sao permitidos"));
      return;
    }
    callback(null, true);
  }
});

export const documentsRouter = Router();

const uploadDir = path.resolve("uploads", "documents");

documentsRouter.post("/:id/upload", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), upload.single("file"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  if (!req.file) return res.status(400).json({ error: "Arquivo PDF obrigatorio" });
  const documentId = z.string().min(1).parse(req.params.id);
  const isPdf = req.file.buffer.subarray(0, 5).toString("utf8") === "%PDF-";
  if (!isPdf) return res.status(400).json({ error: "Arquivo invalido: envie um PDF real" });

  const currentDocument = await prisma.document.findUnique({
    where: { id: documentId },
    include: { process: { include: { entrepreneur: true } } }
  });
  if (!currentDocument) return res.status(404).json({ error: "Documento nao encontrado" });
  if (user.role === "EMPREENDEDOR" && currentDocument.process.entrepreneur.userId !== user.id) {
    return res.status(403).json({ error: "Documento fora dos seus processos" });
  }
  if (user.role === "ANALISTA" && !canChangeProcess(user, currentDocument.process)) {
    return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  }

  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, req.file.buffer);

  const document = await prisma.document.update({
    where: { id: documentId },
    data: {
      fileName: safeName,
      filePath,
      mimeType: req.file.mimetype,
      status: "ENVIADO",
      uploadedAt: new Date()
    }
  });

  await recordAudit(user, "DOCUMENT_UPLOAD", "Document", documentId, {
    processId: currentDocument.processId,
    fileName: safeName
  });

  return res.json(document);
});

documentsRouter.patch("/:id/status", requireAuth, allowRoles("ADMIN", "ANALISTA"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const documentId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    status: z.enum([DocumentStatus.VALIDADO, DocumentStatus.RECUSADO]),
    notes: z.string().trim().max(2000).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status do documento invalido" });

  const currentDocument = await prisma.document.findFirst({
    where: { id: documentId, process: processScope(user) },
    include: { process: true }
  });
  if (!currentDocument) return res.status(404).json({ error: "Documento nao encontrado" });
  if (!canChangeProcess(user, currentDocument.process)) {
    return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  }

  const document = await prisma.document.update({
    where: { id: documentId },
    data: { status: parsed.data.status, notes: parsed.data.notes }
  });

  await prisma.processHistory.create({
    data: {
      processId: currentDocument.processId,
      status: currentDocument.process.status,
      description: `Documento ${currentDocument.name} marcado como ${parsed.data.status}.`,
      actorName: user.name
    }
  });

  await recordAudit(user, "DOCUMENT_STATUS", "Document", documentId, {
    processId: currentDocument.processId,
    status: parsed.data.status
  });

  return res.json(document);
});

documentsRouter.get("/:id/download", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const documentId = z.string().min(1).parse(req.params.id);
  const currentDocument = await prisma.document.findFirst({
    where: { id: documentId, process: processScope(user) },
    select: { id: true, fileName: true, filePath: true, processId: true }
  });
  if (!currentDocument?.filePath) return res.status(404).json({ error: "Arquivo nao encontrado" });

  const resolvedFile = path.resolve(currentDocument.filePath);
  if (!resolvedFile.startsWith(`${uploadDir}${path.sep}`)) {
    return res.status(404).json({ error: "Arquivo nao encontrado" });
  }

  try {
    await access(resolvedFile);
  } catch {
    return res.status(404).json({ error: "Arquivo nao encontrado" });
  }

  await recordAudit(user, "DOCUMENT_DOWNLOAD", "Document", documentId, { processId: currentDocument.processId });
  return res.download(resolvedFile, currentDocument.fileName ?? path.basename(resolvedFile));
});
