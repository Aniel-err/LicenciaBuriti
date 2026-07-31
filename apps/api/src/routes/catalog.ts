import { Router } from "express";
import { LicenseType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const catalogRouter = Router();

const activitySchema = z.object({
  code: z.string().trim().min(2),
  description: z.string().trim().min(3),
  size: z.string().trim().min(2),
  pollutionLevel: z.string().trim().min(2),
  requiredLicenses: z.array(z.nativeEnum(LicenseType)).min(1),
  requiredDocuments: z.array(z.string().trim().min(2)).min(1),
  legalBasis: z.string().trim().optional(),
  isActive: z.boolean().default(true)
});

const feeSchema = z.object({
  activityId: z.string().min(1),
  licenseType: z.nativeEnum(LicenseType),
  size: z.string().trim().min(2),
  amountCents: z.coerce.number().int().min(0)
});

catalogRouter.get("/activities", requireAuth, async (_req, res) => {
  const activities = await prisma.activity.findMany({ orderBy: { code: "asc" }, include: { fees: true } });
  return res.json(activities);
});

catalogRouter.post("/activities", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = activitySchema.safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados da atividade invalidos" });

  const activity = await prisma.activity.create({ data: parsed.data });
  await recordAudit(req.user, "ACTIVITY_CREATE", "Activity", activity.id, { code: activity.code });
  return res.status(201).json(activity);
});

catalogRouter.patch("/activities/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados da atividade invalidos", details: parsed.error.flatten() });
  const activity = await prisma.activity.update({ where: { id }, data: parsed.data });
  await recordAudit(req.user, "ACTIVITY_UPDATE", "Activity", id, { code: activity.code, isActive: activity.isActive });
  return res.json(activity);
});

catalogRouter.get("/fees", requireAuth, async (_req, res) => {
  const fees = await prisma.fee.findMany({ include: { activity: true }, orderBy: { amountCents: "asc" } });
  return res.json(fees);
});

catalogRouter.post("/fees", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = feeSchema.safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados da taxa invalidos" });

  const activity = await prisma.activity.findUnique({ where: { id: parsed.data.activityId }, select: { id: true } });
  if (!activity) return res.status(404).json({ error: "Atividade nao encontrada" });

  const fee = await prisma.fee.create({ data: parsed.data });
  await recordAudit(req.user, "FEE_CREATE", "Fee", fee.id, { activityId: fee.activityId, licenseType: fee.licenseType });
  return res.status(201).json(fee);
});

catalogRouter.patch("/fees/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = feeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados da taxa invalidos", details: parsed.error.flatten() });
  const activity = await prisma.activity.findUnique({ where: { id: parsed.data.activityId }, select: { id: true } });
  if (!activity) return res.status(404).json({ error: "Atividade nao encontrada" });
  const fee = await prisma.fee.update({ where: { id }, data: parsed.data });
  await recordAudit(req.user, "FEE_UPDATE", "Fee", id, { activityId: fee.activityId, licenseType: fee.licenseType });
  return res.json(fee);
});

catalogRouter.delete("/fees/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  await prisma.fee.delete({ where: { id } });
  await recordAudit(req.user, "FEE_DELETE", "Fee", id);
  return res.status(204).send();
});

catalogRouter.get("/license-rules", requireAuth, async (_req, res) => {
  const rules = await prisma.licenseRule.findMany({ orderBy: { licenseType: "asc" } });
  return res.json(rules);
});

catalogRouter.patch("/license-rules/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    displayName: z.string().trim().min(3),
    deadlineDays: z.coerce.number().int().min(1).max(3650),
    validityDays: z.coerce.number().int().min(1).max(3650),
    requiresInspection: z.boolean(),
    requiredDocuments: z.array(z.string().trim().min(2)),
    legalBasis: z.string().trim().optional(),
    isActive: z.boolean()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Regra de licenca invalida", details: parsed.error.flatten() });
  const rule = await prisma.licenseRule.update({ where: { id }, data: parsed.data });
  await recordAudit(req.user, "LICENSE_RULE_UPDATE", "LicenseRule", id, {
    licenseType: rule.licenseType,
    isActive: rule.isActive
  });
  return res.json(rule);
});
