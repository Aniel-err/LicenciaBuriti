import { access } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { assertPdfLooksSafe, resolveManagedFile, saveManagedFile } from "../documents/storage.js";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { entrepreneurScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype === "application/pdf")
});

const managerSchema = z.object({
  entrepreneurId: z.string().min(1),
  enterpriseId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(3),
  cpf: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11, "CPF invalido"),
  council: z.string().trim().min(2),
  professionalId: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  email: z.string().trim().email()
});

export const technicalManagersRouter = Router();

technicalManagersRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const enterpriseId = typeof req.query.enterpriseId === "string" ? req.query.enterpriseId : undefined;
  const managers = await prisma.technicalManager.findMany({
    where: {
      entrepreneur: entrepreneurScope(user),
      enterpriseId
    },
    include: {
      enterprise: { select: { id: true, name: true } },
      entrepreneur: { select: { id: true, name: true } }
    },
    orderBy: { name: "asc" }
  });
  return res.json(managers);
});

technicalManagersRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const parsed = managerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do responsavel tecnico invalidos", details: parsed.error.flatten() });

  const entrepreneur = await prisma.entrepreneur.findFirst({
    where: { id: parsed.data.entrepreneurId, AND: [entrepreneurScope(user)] },
    select: { id: true }
  });
  if (!entrepreneur) return res.status(404).json({ error: "Empreendedor nao encontrado" });

  if (parsed.data.enterpriseId) {
    const enterprise = await prisma.enterprise.findFirst({
      where: { id: parsed.data.enterpriseId, entrepreneurId: entrepreneur.id },
      select: { id: true }
    });
    if (!enterprise) return res.status(400).json({ error: "Empreendimento nao pertence ao empreendedor informado" });
  }

  const manager = await prisma.technicalManager.create({ data: parsed.data });
  await recordAudit(user, "TECHNICAL_MANAGER_CREATE", "TechnicalManager", manager.id, {
    entrepreneurId: manager.entrepreneurId,
    enterpriseId: manager.enterpriseId
  });
  return res.status(201).json(manager);
});

technicalManagersRouter.patch("/:id", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const current = await prisma.technicalManager.findFirst({
    where: { id, entrepreneur: entrepreneurScope(user) }
  });
  if (!current) return res.status(404).json({ error: "Responsavel tecnico nao encontrado" });

  const parsed = managerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do responsavel tecnico invalidos", details: parsed.error.flatten() });
  if (user.role === "EMPREENDEDOR" && parsed.data.entrepreneurId !== current.entrepreneurId) {
    return res.status(403).json({ error: "Nao e permitido alterar o empreendedor vinculado" });
  }

  if (parsed.data.enterpriseId) {
    const enterprise = await prisma.enterprise.findFirst({
      where: { id: parsed.data.enterpriseId, entrepreneurId: parsed.data.entrepreneurId },
      select: { id: true }
    });
    if (!enterprise) return res.status(400).json({ error: "Empreendimento nao pertence ao empreendedor informado" });
  }

  const manager = await prisma.technicalManager.update({ where: { id }, data: parsed.data });
  await recordAudit(user, "TECHNICAL_MANAGER_UPDATE", "TechnicalManager", id, {
    entrepreneurId: manager.entrepreneurId,
    enterpriseId: manager.enterpriseId
  });
  return res.json(manager);
});

technicalManagersRouter.post("/:id/art", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), upload.single("file"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  if (!req.file || req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Envie a ART em PDF" });
  if (req.file.buffer.subarray(0, 5).toString("utf8") !== "%PDF-") return res.status(400).json({ error: "Arquivo PDF invalido" });
  assertPdfLooksSafe(req.file.buffer);

  const id = z.string().min(1).parse(req.params.id);
  const current = await prisma.technicalManager.findFirst({
    where: { id, entrepreneur: entrepreneurScope(user) }
  });
  if (!current) return res.status(404).json({ error: "Responsavel tecnico nao encontrado" });

  const stored = await saveManagedFile("technical-managers", id, req.file.originalname, req.file.buffer);
  const manager = await prisma.technicalManager.update({
    where: { id },
    data: { artDocument: stored.filePath }
  });
  await recordAudit(user, "TECHNICAL_MANAGER_ART_UPLOAD", "TechnicalManager", id, {
    fileSha256: stored.fileSha256,
    fileSizeBytes: stored.fileSizeBytes
  });
  return res.json(manager);
});

technicalManagersRouter.get("/:id/art", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const manager = await prisma.technicalManager.findFirst({
    where: { id, entrepreneur: entrepreneurScope(user) },
    select: { artDocument: true }
  });
  const resolved = resolveManagedFile(manager?.artDocument);
  if (!resolved) return res.status(404).json({ error: "ART nao encontrada" });
  try {
    await access(resolved);
  } catch {
    return res.status(404).json({ error: "ART nao encontrada" });
  }
  await recordAudit(user, "TECHNICAL_MANAGER_ART_DOWNLOAD", "TechnicalManager", id);
  return res.download(resolved, path.basename(resolved));
});

technicalManagersRouter.delete("/:id", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const manager = await prisma.technicalManager.findFirst({
    where: { id, entrepreneur: entrepreneurScope(user) },
    select: { id: true }
  });
  if (!manager) return res.status(404).json({ error: "Responsavel tecnico nao encontrado" });
  await prisma.technicalManager.delete({ where: { id } });
  await recordAudit(user, "TECHNICAL_MANAGER_DELETE", "TechnicalManager", id);
  return res.status(204).send();
});
