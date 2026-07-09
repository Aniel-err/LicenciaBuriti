import { Router } from "express";
import { InspectionType, ProcessStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { inspectionScope, processScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const inspectionsRouter = Router();

inspectionsRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const inspections = await prisma.inspection.findMany({
    where: inspectionScope(user),
    orderBy: { createdAt: "desc" },
    include: { process: { include: { enterprise: true, entrepreneur: true } } }
  });
  const fiscalIds = Array.from(new Set(inspections.map((inspection) => inspection.fiscalId)));
  const fiscais = await prisma.user.findMany({ where: { id: { in: fiscalIds } }, select: { id: true, name: true } });
  const fiscalNames = new Map(fiscais.map((fiscal) => [fiscal.id, fiscal.name]));
  return res.json(inspections.map((inspection) => ({
    ...inspection,
    fiscalName: fiscalNames.get(inspection.fiscalId) ?? "Fiscal nao identificado"
  })));
});

inspectionsRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA"), async (req, res) => {
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

  const [process, fiscal] = await Promise.all([
    prisma.process.findFirst({ where: { id: parsed.data.processId, AND: [processScope(user)] }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: parsed.data.fiscalId, role: "FISCAL", isActive: true }, select: { id: true } })
  ]);
  if (!process) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!fiscal) return res.status(400).json({ error: "Fiscal invalido" });

  const inspection = await prisma.inspection.create({ data: parsed.data });
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
    fiscalId: parsed.data.fiscalId,
    type: parsed.data.type
  });
  return res.status(201).json(inspection);
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
