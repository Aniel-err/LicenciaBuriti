import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de login invalidos" });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { entrepreneur: { select: { id: true } } }
  });
  if (!user || !user.isActive) return res.status(401).json({ error: "Credenciais invalidas" });

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) return res.status(401).json({ error: "Credenciais invalidas" });

  const sessionUser = { id: user.id, name: user.name, email: user.email, role: user.role, entrepreneurId: user.entrepreneur?.id ?? null };
  await recordAudit(sessionUser, "LOGIN", "Sessao", user.id, { email: user.email, role: user.role });
  return res.json({ token: signToken(sessionUser), user: sessionUser });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  return res.json({ user: req.user });
});
