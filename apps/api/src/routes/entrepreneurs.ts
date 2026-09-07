import { Router } from "express";
import { PersonType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { entrepreneurScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const entrepreneursRouter = Router();

const entrepreneurSchema = z.object({
  personType: z.nativeEnum(PersonType),
  name: z.string().trim().min(3),
  cpf: z.string().trim().optional(),
  rg: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  tradeName: z.string().trim().optional(),
  cnpj: z.string().trim().optional(),
  stateRegistration: z.string().trim().optional(),
  legalRepresentative: z.string().trim().optional(),
  address: z.string().trim().min(3),
  phone: z.string().trim().min(8),
  email: z.string().trim().email()
}).superRefine((data, context) => {
  const cpf = data.cpf?.replace(/\D/g, "") ?? "";
  const cnpj = data.cnpj?.replace(/\D/g, "") ?? "";
  if (data.personType === PersonType.PF && cpf.length !== 11) {
    context.addIssue({ code: "custom", path: ["cpf"], message: "CPF deve conter 11 digitos" });
  }
  if (data.personType === PersonType.PJ && cnpj.length !== 14) {
    context.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ deve conter 14 digitos" });
  }
});

function normalizeEntrepreneur(data: z.infer<typeof entrepreneurSchema>) {
  return {
    ...data,
    cpf: data.personType === PersonType.PF ? data.cpf?.replace(/\D/g, "") : null,
    rg: data.personType === PersonType.PF ? data.rg || null : null,
    companyName: data.personType === PersonType.PJ ? data.companyName || data.name : null,
    tradeName: data.personType === PersonType.PJ ? data.tradeName || null : null,
    cnpj: data.personType === PersonType.PJ ? data.cnpj?.replace(/\D/g, "") : null,
    stateRegistration: data.personType === PersonType.PJ ? data.stateRegistration || null : null,
    legalRepresentative: data.personType === PersonType.PJ ? data.legalRepresentative || null : null
  };
}

async function identityAlreadyExists(cpf: string | null | undefined, cnpj: string | null | undefined, exceptId?: string) {
  if (!cpf && !cnpj) return false;
  const existing = await prisma.entrepreneur.findFirst({
    where: {
      id: exceptId ? { not: exceptId } : undefined,
      OR: [
        ...(cpf ? [{ cpf }] : []),
        ...(cnpj ? [{ cnpj }] : [])
      ]
    },
    select: { id: true }
  });
  return Boolean(existing);
}

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
  const parsed = entrepreneurSchema.safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendedor invalidos", details: parsed.error.flatten() });

  const existing = req.user?.role === "EMPREENDEDOR"
    ? await prisma.entrepreneur.findUnique({ where: { userId: req.user.id }, select: { id: true } })
    : null;
  if (existing) return res.status(409).json({ error: "Usuario empreendedor ja possui cadastro vinculado" });

  const normalized = normalizeEntrepreneur(parsed.data);
  if (await identityAlreadyExists(normalized.cpf, normalized.cnpj)) {
    return res.status(409).json({ error: "CPF ou CNPJ ja cadastrado" });
  }

  const entrepreneur = await prisma.entrepreneur.create({
    data: {
      ...normalized,
      userId: req.user?.role === "EMPREENDEDOR" ? req.user.id : undefined
    }
  });
  await recordAudit(req.user, "ENTREPRENEUR_CREATE", "Entrepreneur", entrepreneur.id, {
    userId: entrepreneur.userId,
    personType: entrepreneur.personType
  });
  return res.status(201).json(entrepreneur);
});

entrepreneursRouter.patch("/:id", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const current = await prisma.entrepreneur.findFirst({ where: { id, AND: [entrepreneurScope(user)] } });
  if (!current) return res.status(404).json({ error: "Empreendedor nao encontrado" });

  const parsed = entrepreneurSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do empreendedor invalidos", details: parsed.error.flatten() });

  const normalized = normalizeEntrepreneur(parsed.data);
  if (await identityAlreadyExists(normalized.cpf, normalized.cnpj, id)) {
    return res.status(409).json({ error: "CPF ou CNPJ ja cadastrado" });
  }

  const entrepreneur = await prisma.entrepreneur.update({ where: { id }, data: normalized });
  await recordAudit(user, "ENTREPRENEUR_UPDATE", "Entrepreneur", id, {
    personType: entrepreneur.personType
  });
  return res.json(entrepreneur);
});
