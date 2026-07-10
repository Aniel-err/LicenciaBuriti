import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, allowRoles("ADMIN"));

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true, entrepreneur: { select: { id: true } } }
  });
  return res.json(users.map((user) => ({ ...user, entrepreneurId: user.entrepreneur?.id ?? null, entrepreneur: undefined })));
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

adminRouter.patch("/users/:id/status", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status invalido" });

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
