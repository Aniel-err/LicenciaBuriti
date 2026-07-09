import { Router } from "express";
import { PersonType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { entrepreneurScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const entrepreneursRouter = Router();

entrepreneursRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const entrepreneurs = await prisma.entrepreneur.findMany({
    where: entrepreneurScope(user),
    orderBy: { createdAt: "desc" },
    include: { enterprises: true, technicalManagers: true }
  });
  return res.json(entrepreneurs);
});

entrepreneursRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const parsed = z.object({
    personType: z.nativeEnum(PersonType),
    name: z.string().min(3),
    cpf: z.string().optional(),
    rg: z.string().optional(),
    companyName: z.string().optional(),
    tradeName: z.string().optional(),
    cnpj: z.string().optional(),
    stateRegistration: z.string().optional(),
    legalRepresentative: z.string().optional(),
    address: z.string().min(3),
    phone: z.string().min(8),
    email: z.string().email()
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendedor invalidos" });

  const existing = req.user?.role === "EMPREENDEDOR"
    ? await prisma.entrepreneur.findUnique({ where: { userId: req.user.id }, select: { id: true } })
    : null;
  if (existing) return res.status(409).json({ error: "Usuario empreendedor ja possui cadastro vinculado" });

  const entrepreneur = await prisma.entrepreneur.create({
    data: {
      ...parsed.data,
      userId: req.user?.role === "EMPREENDEDOR" ? req.user.id : undefined
    }
  });
  await recordAudit(req.user, "ENTREPRENEUR_CREATE", "Entrepreneur", entrepreneur.id, {
    userId: entrepreneur.userId,
    personType: entrepreneur.personType
  });
  return res.status(201).json(entrepreneur);
});
