import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const settingsRouter = Router();

const defaultConfig = {
  agency: "Secretaria Municipal de Meio Ambiente e Turismo",
  municipality: "Buriti - MA",
  analysisDeadlineDays: 30,
  expirationAlertDays: 45,
  maxUploadMb: 10,
  publicSearchEnabled: true
};

settingsRouter.get("/", requireAuth, async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", ...defaultConfig }
  });
  return res.json(config);
});

settingsRouter.put("/", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const parsed = z.object({
    agency: z.string().trim().min(3),
    municipality: z.string().trim().min(3),
    analysisDeadlineDays: z.coerce.number().int().min(1).max(365),
    expirationAlertDays: z.coerce.number().int().min(1).max(365),
    maxUploadMb: z.coerce.number().int().min(1).max(50),
    publicSearchEnabled: z.boolean()
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Configuracao invalida" });

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data }
  });

  await recordAudit(req.user, "SETTINGS_UPDATE", "SystemConfig", "default", parsed.data);
  return res.json(config);
});
