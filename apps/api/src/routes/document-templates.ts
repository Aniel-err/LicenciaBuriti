import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

export const documentTemplatesRouter = Router();

documentTemplatesRouter.get("/", requireAuth, allowRoles("ADMIN", "ANALISTA"), async (_req, res) => {
  const templates = await prisma.documentTemplate.findMany({ orderBy: { createdAt: "desc" } });
  return res.json(templates);
});

documentTemplatesRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA"), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(3),
    type: z.string().trim().min(3),
    content: z.string().trim().min(10),
    isActive: z.boolean().default(true)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Modelo invalido" });

  const template = await prisma.documentTemplate.create({ data: parsed.data });
  await recordAudit(req.user, "TEMPLATE_CREATE", "DocumentTemplate", template.id, { type: template.type });
  return res.status(201).json(template);
});

documentTemplatesRouter.delete("/:id", requireAuth, allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  await prisma.documentTemplate.delete({ where: { id } });
  await recordAudit(req.user, "TEMPLATE_DELETE", "DocumentTemplate", id);
  return res.status(204).send();
});
