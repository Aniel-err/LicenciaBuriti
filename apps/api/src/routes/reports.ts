import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { processScope } from "../security/access-control.js";

export const reportsRouter = Router();

reportsRouter.get("/summary", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;
  const scopedWhere = processScope(user);
  const dateWhere = dateFrom || dateTo ? { openedAt: { gte: dateFrom, lte: dateTo } } : {};
  const where = { AND: [scopedWhere, dateWhere] };
  const [byStatus, byLicense, byAnalyst, issued, fees] = await Promise.all([
    prisma.process.groupBy({ by: ["status"], where, _count: true }),
    prisma.process.groupBy({ by: ["licenseType"], where, _count: true }),
    prisma.process.groupBy({ by: ["analystId"], where, _count: true }),
    prisma.issuedDocument.findMany({
      where: { process: { is: where } },
      include: { process: { select: { licenseType: true, enterprise: { select: { activityId: true, size: true } } } } }
    }),
    prisma.fee.findMany()
  ]);

  const feeByKey = new Map(fees.map((fee) => [`${fee.activityId}:${fee.licenseType}:${fee.size}`, fee.amountCents]));
  const issuedAmountCents = issued.reduce((total, document) => {
    const key = `${document.process.enterprise.activityId}:${document.process.licenseType}:${document.process.enterprise.size}`;
    return total + (feeByKey.get(key) ?? 0);
  }, 0);

  return res.json({
    byStatus,
    byLicense,
    byAnalyst,
    issuedCount: issued.length,
    issuedAmountCents,
    filters: {
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString()
    }
  });
});
