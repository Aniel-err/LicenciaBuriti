import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { processScope } from "../security/access-control.js";

export const reportsRouter = Router();

reportsRouter.get("/summary", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const scopedWhere = processScope(user);
  const [byStatus, byLicense, byAnalyst] = await Promise.all([
    prisma.process.groupBy({ by: ["status"], where: scopedWhere, _count: true }),
    prisma.process.groupBy({ by: ["licenseType"], where: scopedWhere, _count: true }),
    prisma.process.groupBy({ by: ["analystId"], where: scopedWhere, _count: true })
  ]);

  return res.json({ byStatus, byLicense, byAnalyst });
});
