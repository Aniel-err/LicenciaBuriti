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
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true }
  });
  return res.json(users);
});

adminRouter.post("/users", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    role: z.nativeEnum(UserRole),
    phone: z.string().optional(),
    password: z.string().min(10)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados do usuario invalidos" });

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      phone: parsed.data.phone,
      passwordHash: await bcrypt.hash(parsed.data.password, 10)
    },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true }
  });

  await recordAudit(req.user, "USER_CREATE", "User", user.id, { email: user.email, role: user.role });
  return res.status(201).json(user);
});

adminRouter.patch("/users/:id/status", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status invalido" });

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true }
  });

  await recordAudit(req.user, "USER_STATUS", "User", id, { isActive: parsed.data.isActive });
  return res.json(user);
});

adminRouter.get("/audit", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } }
  });
  return res.json(logs);
});
