import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { auditContext, recordAudit } from "../security/audit.js";

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

authRouter.put("/password", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const parsed = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(12)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de senha invalidos" });

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, passwordHash: true } });
  if (!user) return res.status(401).json({ error: "Sessao invalida ou expirada" });

  const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!matches) return res.status(403).json({ error: "Senha atual invalida" });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) }
  });
  await recordAudit(req.user, "PASSWORD_CHANGE", "User", user.id, undefined, auditContext(req));
  return res.status(204).send();
});
