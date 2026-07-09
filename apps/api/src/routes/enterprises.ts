import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { enterpriseScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const enterprisesRouter = Router();

enterprisesRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const enterprises = await prisma.enterprise.findMany({
    where: enterpriseScope(user),
    orderBy: { name: "asc" },
    include: { entrepreneur: true, activity: true, processes: true }
  });
  return res.json(enterprises);
});

enterprisesRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const parsed = z.object({
    entrepreneurId: z.string(),
    name: z.string().min(3),
    address: z.string().min(3),
    municipality: z.string().default("Buriti - MA"),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    activityId: z.string(),
    areaHectares: z.coerce.number().optional(),
    fiscalModules: z.coerce.number().optional(),
    size: z.string().min(2),
    pollutionLevel: z.string().min(2),
    propertyClass: z.string().min(2)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendimento invalidos" });

  const entrepreneurId = req.user?.role === "EMPREENDEDOR"
    ? (await prisma.entrepreneur.findUnique({ where: { userId: req.user.id }, select: { id: true } }))?.id
    : parsed.data.entrepreneurId;

  if (!entrepreneurId) return res.status(403).json({ error: "Usuario sem cadastro de empreendedor vinculado" });

  const [entrepreneur, activity] = await Promise.all([
    prisma.entrepreneur.findUnique({ where: { id: entrepreneurId }, select: { id: true } }),
    prisma.activity.findUnique({ where: { id: parsed.data.activityId }, select: { id: true } })
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
