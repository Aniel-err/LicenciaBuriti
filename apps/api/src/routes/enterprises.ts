import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { enterpriseScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const enterprisesRouter = Router();

const enterpriseSchema = z.object({
  entrepreneurId: z.string(),
  name: z.string().trim().min(3),
  address: z.string().trim().min(3),
  municipality: z.string().trim().min(2).default("Buriti - MA"),
  district: z.string().trim().optional(),
  zone: z.enum(["URBANA", "RURAL"]).default("URBANA"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  activityId: z.string(),
  areaHectares: z.coerce.number().nonnegative().optional(),
  fiscalModules: z.coerce.number().nonnegative().optional(),
  size: z.string().trim().min(2),
  pollutionLevel: z.string().trim().min(2),
  propertyClass: z.string().trim().min(2)
});

enterprisesRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const enterprises = await prisma.enterprise.findMany({
    where: enterpriseScope(user),
    orderBy: { name: "asc" },
    include: { entrepreneur: true, activity: true, processes: true, technicalManagers: true }
  });
  return res.json(enterprises);
});

enterprisesRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const parsed = enterpriseSchema.safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendimento invalidos", details: parsed.error.flatten() });

  const entrepreneurId = req.user?.role === "EMPREENDEDOR"
    ? (await prisma.entrepreneur.findUnique({ where: { userId: req.user.id }, select: { id: true } }))?.id
    : parsed.data.entrepreneurId;

  if (!entrepreneurId) return res.status(403).json({ error: "Usuario sem cadastro de empreendedor vinculado" });

  const [entrepreneur, activity] = await Promise.all([
    prisma.entrepreneur.findUnique({ where: { id: entrepreneurId }, select: { id: true } }),
    prisma.activity.findFirst({ where: { id: parsed.data.activityId, isActive: true }, select: { id: true } })
  ]);
  if (!entrepreneur) return res.status(404).json({ error: "Empreendedor nao encontrado" });
  if (!activity) return res.status(404).json({ error: "Atividade nao encontrada" });

  const enterprise = await prisma.enterprise.create({
    data: {
      ...parsed.data,
      entrepreneurId
    }
  });
  await recordAudit(req.user, "ENTERPRISE_CREATE", "Enterprise", enterprise.id, { entrepreneurId });
  return res.status(201).json(enterprise);
});

enterprisesRouter.patch("/:id", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const current = await prisma.enterprise.findFirst({ where: { id, AND: [enterpriseScope(user)] } });
  if (!current) return res.status(404).json({ error: "Empreendimento nao encontrado" });

  const parsed = enterpriseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendimento invalidos", details: parsed.error.flatten() });

  const entrepreneurId = user.role === "EMPREENDEDOR" ? current.entrepreneurId : parsed.data.entrepreneurId;
  const [entrepreneur, activity] = await Promise.all([
    prisma.entrepreneur.findUnique({ where: { id: entrepreneurId }, select: { id: true } }),
    prisma.activity.findFirst({ where: { id: parsed.data.activityId, isActive: true }, select: { id: true } })
  ]);
  if (!entrepreneur) return res.status(404).json({ error: "Empreendedor nao encontrado" });
  if (!activity) return res.status(404).json({ error: "Atividade nao encontrada ou inativa" });

  const enterprise = await prisma.enterprise.update({
    where: { id },
    data: { ...parsed.data, entrepreneurId }
  });
  await recordAudit(user, "ENTERPRISE_UPDATE", "Enterprise", id, {
    entrepreneurId,
    activityId: enterprise.activityId
  });
  return res.json(enterprise);
});
