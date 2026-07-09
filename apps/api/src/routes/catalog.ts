import { Router } from "express";
import { LicenseType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const catalogRouter = Router();

catalogRouter.get("/activities", requireAuth, async (_req, res) => {
  const activities = await prisma.activity.findMany({ orderBy: { code: "asc" }, include: { fees: true } });
  return res.json(activities);
});

catalogRouter.post("/activities", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({
    code: z.string().min(2),
    description: z.string().min(3),
    size: z.string(),
    pollutionLevel: z.string(),
    requiredLicenses: z.array(z.nativeEnum(LicenseType)),
    requiredDocuments: z.array(z.string().min(2))
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados da atividade invalidos" });

  const activity = await prisma.activity.create({ data: parsed.data });
  await recordAudit(req.user, "ACTIVITY_CREATE", "Activity", activity.id, { code: activity.code });
  return res.status(201).json(activity);
});

catalogRouter.get("/fees", requireAuth, async (_req, res) => {
  const fees = await prisma.fee.findMany({ include: { activity: true }, orderBy: { amountCents: "asc" } });
  return res.json(fees);
});

catalogRouter.post("/fees", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({
    activityId: z.string().min(1),
    licenseType: z.nativeEnum(LicenseType),
    size: z.string().min(2),
    amountCents: z.coerce.number().int().min(0)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados da taxa invalidos" });

  const activity = await prisma.activity.findUnique({ where: { id: parsed.data.activityId }, select: { id: true } });
  if (!activity) return res.status(404).json({ error: "Atividade nao encontrada" });

  const fee = await prisma.fee.create({ data: parsed.data });
  await recordAudit(req.user, "FEE_CREATE", "Fee", fee.id, { activityId: fee.activityId, licenseType: fee.licenseType });
  return res.status(201).json(fee);
});
