import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PersonType, UserRole } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { auditContext, recordAudit } from "../security/audit.js";
import { errorToLog, logger } from "../security/logger.js";
import { sendPasswordResetEmail } from "../services/email.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente." }
});

const passwordSchema = z.string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Inclua uma letra minuscula")
  .regex(/[A-Z]/, "Inclua uma letra maiuscula")
  .regex(/\d/, "Inclua um numero");

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de login invalidos" });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
    include: { entrepreneur: { select: { id: true } } }
  });
  if (!user || !user.isActive) return res.status(401).json({ error: "Credenciais invalidas" });

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) return res.status(401).json({ error: "Credenciais invalidas" });

  const sessionUser = { id: user.id, name: user.name, email: user.email, role: user.role, entrepreneurId: user.entrepreneur?.id ?? null };
  await recordAudit(sessionUser, "LOGIN", "Sessao", user.id, { email: user.email, role: user.role });
  return res.json({ token: signToken(sessionUser), user: sessionUser });
});

authRouter.post("/register", async (req, res) => {
  const parsed = z.object({
    personType: z.nativeEnum(PersonType),
    name: z.string().trim().min(3),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: passwordSchema,
    phone: z.string().trim().min(8),
    address: z.string().trim().min(3),
    cpf: z.string().trim().optional(),
    rg: z.string().trim().optional(),
    companyName: z.string().trim().optional(),
    tradeName: z.string().trim().optional(),
    cnpj: z.string().trim().optional(),
    stateRegistration: z.string().trim().optional(),
    legalRepresentative: z.string().trim().optional()
  }).superRefine((data, context) => {
    const cpf = data.cpf?.replace(/\D/g, "") ?? "";
    const cnpj = data.cnpj?.replace(/\D/g, "") ?? "";
    if (data.personType === PersonType.PF && cpf.length !== 11) {
      context.addIssue({ code: "custom", path: ["cpf"], message: "CPF deve conter 11 digitos" });
    }
    if (data.personType === PersonType.PJ && cnpj.length !== 14) {
      context.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ deve conter 14 digitos" });
    }
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de cadastro invalidos", details: parsed.error.flatten() });

  const cpf = parsed.data.personType === PersonType.PF ? parsed.data.cpf?.replace(/\D/g, "") : null;
  const cnpj = parsed.data.personType === PersonType.PJ ? parsed.data.cnpj?.replace(/\D/g, "") : null;
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  const existingIdentity = await prisma.entrepreneur.findFirst({
    where: { OR: [...(cpf ? [{ cpf }] : []), ...(cnpj ? [{ cnpj }] : [])] },
    select: { id: true }
  });
  if (existing || existingIdentity) return res.status(409).json({ error: "E-mail, CPF ou CNPJ ja cadastrado" });

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        phone: parsed.data.phone,
        role: UserRole.EMPREENDEDOR
      }
    });
    const entrepreneur = await tx.entrepreneur.create({
      data: {
        userId: user.id,
        personType: parsed.data.personType,
        name: parsed.data.name,
        cpf,
        rg: parsed.data.personType === PersonType.PF ? parsed.data.rg || null : null,
        companyName: parsed.data.personType === PersonType.PJ ? parsed.data.companyName || parsed.data.name : null,
        tradeName: parsed.data.personType === PersonType.PJ ? parsed.data.tradeName || null : null,
        cnpj,
        stateRegistration: parsed.data.personType === PersonType.PJ ? parsed.data.stateRegistration || null : null,
        legalRepresentative: parsed.data.personType === PersonType.PJ ? parsed.data.legalRepresentative || null : null,
        address: parsed.data.address,
        phone: parsed.data.phone,
        email: parsed.data.email
      }
    });
    return { user, entrepreneur };
  });

  const sessionUser = {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    entrepreneurId: result.entrepreneur.id
  };
  await recordAudit(sessionUser, "PUBLIC_REGISTER", "User", result.user.id, {
    personType: result.entrepreneur.personType
  }, auditContext(req));
  return res.status(201).json({ token: signToken(sessionUser), user: sessionUser });
});

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um e-mail valido" });
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true, role: true, isActive: true, entrepreneur: { select: { id: true } } }
  });
  let developmentResetToken: string | undefined;

  if (user?.isActive) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + config.passwordResetMinutes * 60 * 1000);
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })
    ]);
    try {
      const delivered = await sendPasswordResetEmail(user.email, user.name, token);
      if (!delivered && !config.isProduction) developmentResetToken = token;
    } catch (error) {
      logger.error({
        requestId: req.requestId,
        userId: user.id,
        action: "PASSWORD_RESET_EMAIL_FAILED",
        error: errorToLog(error)
      }, "password_reset_email_failed");
      if (!config.isProduction) developmentResetToken = token;
    }
    await recordAudit({ id: user.id, name: user.name, email: user.email, role: user.role, entrepreneurId: user.entrepreneur?.id ?? null }, "PASSWORD_RESET_REQUEST", "User", user.id, undefined, auditContext(req));
  }

  return res.status(202).json({
    message: "Se o e-mail estiver cadastrado, as instrucoes de redefinicao serao enviadas.",
    developmentResetToken
  });
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = z.object({ token: z.string().min(32).max(200), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Token ou nova senha invalidos", details: parsed.error.flatten() });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true, entrepreneur: { select: { id: true } } } } }
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date() || !resetToken.user.isActive) {
    return res.status(400).json({ error: "Token invalido ou expirado" });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) }
    }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } })
  ]);
  await recordAudit({
    id: resetToken.user.id,
    name: resetToken.user.name,
    email: resetToken.user.email,
    role: resetToken.user.role,
    entrepreneurId: resetToken.user.entrepreneur?.id ?? null
  }, "PASSWORD_RESET_COMPLETE", "User", resetToken.userId, undefined, auditContext(req));
  return res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  return res.json({ user: req.user });
});

authRouter.put("/password", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const parsed = z.object({
    currentPassword: z.string().min(6),
    newPassword: passwordSchema
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
