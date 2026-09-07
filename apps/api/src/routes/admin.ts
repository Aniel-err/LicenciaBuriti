import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";
import { permissions } from "../security/permissions.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, allowRoles("ADMIN"));

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true, entrepreneur: { select: { id: true } } }
  });
  return res.json(users.map((user) => ({ ...user, entrepreneurId: user.entrepreneur?.id ?? null, entrepreneur: undefined })));
});

adminRouter.get("/permissions", async (_req, res) => {
  return res.json(permissions);
});

adminRouter.post("/users", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    role: z.nativeEnum(UserRole),
    phone: z.string().optional(),
    password: z.string().min(10),
    entrepreneurId: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do usuario invalidos" });
  if (parsed.data.role === UserRole.EMPREENDEDOR && !parsed.data.entrepreneurId) {
    return res.status(400).json({ error: "Vincule um empreendedor ao usuario empreendedor" });
  }
  if (parsed.data.role !== UserRole.EMPREENDEDOR && parsed.data.entrepreneurId) {
    return res.status(400).json({ error: "Vinculo de empreendedor permitido apenas para usuario empreendedor" });
  }

  const user = await prisma.$transaction(async (tx) => {
    const entrepreneur = parsed.data.entrepreneurId
      ? await tx.entrepreneur.findUnique({ where: { id: parsed.data.entrepreneurId }, select: { id: true, userId: true } })
      : null;
    if (parsed.data.entrepreneurId && !entrepreneur) throw Object.assign(new Error("Empreendedor nao encontrado"), { status: 404 });
    if (entrepreneur?.userId) throw Object.assign(new Error("Empreendedor ja possui usuario vinculado"), { status: 409 });

    const created = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        phone: parsed.data.phone,
        passwordHash: await bcrypt.hash(parsed.data.password, 10)
      },
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true }
    });

    if (entrepreneur) {
      await tx.entrepreneur.update({ where: { id: entrepreneur.id }, data: { userId: created.id } });
    }

    return { ...created, entrepreneurId: entrepreneur?.id ?? null };
  });

  await recordAudit(req.user, "USER_CREATE", "User", user.id, { email: user.email, role: user.role, entrepreneurId: user.entrepreneurId });
  return res.status(201).json(user);
});

adminRouter.patch("/users/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    name: z.string().min(3).optional(),
    email: z.string().email().optional(),
    role: z.nativeEnum(UserRole).optional(),
    phone: z.string().nullable().optional(),
    password: z.string().min(10).optional(),
    entrepreneurId: z.string().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do usuário inválidos" });

  const existing = await prisma.user.findUnique({
    where: { id },
    include: { entrepreneur: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: "Usuário não encontrado" });
  const nextRole = parsed.data.role ?? existing.role;
  const nextEntrepreneurId = parsed.data.entrepreneurId === undefined
    ? existing.entrepreneur?.id ?? null
    : parsed.data.entrepreneurId;
  if (nextRole === UserRole.EMPREENDEDOR && !nextEntrepreneurId) {
    return res.status(400).json({ error: "Vincule um empreendedor ao usuário empreendedor" });
  }
  if (nextRole !== UserRole.EMPREENDEDOR && nextEntrepreneurId) {
    return res.status(400).json({ error: "Vínculo de empreendedor permitido apenas para usuário empreendedor" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (existing.entrepreneur && existing.entrepreneur.id !== nextEntrepreneurId) {
      await tx.entrepreneur.update({ where: { id: existing.entrepreneur.id }, data: { userId: null } });
    }
    if (nextEntrepreneurId && existing.entrepreneur?.id !== nextEntrepreneurId) {
      const entrepreneur = await tx.entrepreneur.findUnique({ where: { id: nextEntrepreneurId }, select: { userId: true } });
      if (!entrepreneur) throw Object.assign(new Error("Empreendedor não encontrado"), { status: 404 });
      if (entrepreneur.userId && entrepreneur.userId !== id) throw Object.assign(new Error("Empreendedor já possui usuário vinculado"), { status: 409 });
      await tx.entrepreneur.update({ where: { id: nextEntrepreneurId }, data: { userId: id } });
    }
    const user = await tx.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: nextRole,
        phone: parsed.data.phone,
        passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 10) : undefined
      },
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true }
    });
    return { ...user, entrepreneurId: nextEntrepreneurId };
  });

  await recordAudit(req.user, "USER_UPDATE", "User", id, { role: updated.role, entrepreneurId: updated.entrepreneurId });
  return res.json(updated);
});

adminRouter.patch("/users/:id/status", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status invalido" });
  if (req.user?.id === id && !parsed.data.isActive) {
    return res.status(400).json({ error: "Nao e permitido desativar a propria conta" });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, entrepreneur: { select: { id: true } } }
  });

  await recordAudit(req.user, "USER_STATUS", "User", id, { isActive: parsed.data.isActive });
  return res.json({ ...user, entrepreneurId: user.entrepreneur?.id ?? null, entrepreneur: undefined });
});

adminRouter.get("/audit", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } }
  });
  return res.json(logs);
});
