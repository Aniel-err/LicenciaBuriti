import { LicenseType, ProcessStatus, type Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { processScope } from "../security/access-control.js";

export const reportsRouter = Router();

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function reportWhere(req: Parameters<typeof processScope>[0], query: Record<string, unknown>): Prisma.ProcessWhereInput {
  const parts: Prisma.ProcessWhereInput[] = [processScope(req)];
  const year = Number(stringQuery(query.year));
  const month = Number(stringQuery(query.month));
  const status = stringQuery(query.status);
  const licenseType = stringQuery(query.licenseType);
  const activityId = stringQuery(query.activityId);
  const analystId = stringQuery(query.analystId);
  const district = stringQuery(query.district);
  const zone = stringQuery(query.zone);
  const size = stringQuery(query.size);

  if (Number.isInteger(year) && year >= 2000 && year <= 2200) {
    const firstMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : 0;
    const lastMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 12;
    parts.push({
      openedAt: {
        gte: new Date(Date.UTC(year, firstMonth, 1)),
        lt: new Date(Date.UTC(year, lastMonth, 1))
      }
    });
  }
  if (status && Object.values(ProcessStatus).includes(status as ProcessStatus)) parts.push({ status: status as ProcessStatus });
  if (licenseType && Object.values(LicenseType).includes(licenseType as LicenseType)) parts.push({ licenseType: licenseType as LicenseType });
  if (analystId) parts.push({ analystId });
  if (activityId) parts.push({ enterprise: { activityId } });
  if (district) parts.push({ enterprise: { district: { contains: district, mode: "insensitive" } } });
  if (zone === "URBANA" || zone === "RURAL") parts.push({ enterprise: { zone } });
  if (size) parts.push({ enterprise: { size } });

  return { AND: parts };
}

reportsRouter.get("/processes", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticação obrigatória" });
  const where = reportWhere(user, req.query);
  const processes = await prisma.process.findMany({
    where,
    orderBy: { openedAt: "desc" },
    include: {
      entrepreneur: { select: { name: true, companyName: true } },
      enterprise: {
        include: { activity: { select: { id: true, code: true, description: true } } }
      },
      analyst: { select: { id: true, name: true } },
      issuedDocs: { orderBy: { issuedAt: "desc" } }
    }
  });

  const rows = processes.map((process) => ({
    id: process.id,
    number: process.number,
    protocol: process.protocol,
    licenseType: process.licenseType,
    status: process.status,
    openedAt: process.openedAt,
    dueDate: process.dueDate,
    decidedAt: process.decidedAt,
    entrepreneur: process.entrepreneur.companyName ?? process.entrepreneur.name,
    enterprise: process.enterprise.name,
    district: process.enterprise.district,
    zone: process.enterprise.zone,
    size: process.enterprise.size,
    activityId: process.enterprise.activity.id,
    activityCode: process.enterprise.activity.code,
    activity: process.enterprise.activity.description,
    analystId: process.analyst?.id ?? null,
    analyst: process.analyst?.name ?? "Não distribuído",
    issuedCount: process.issuedDocs.length,
    lastIssuedAt: process.issuedDocs[0]?.issuedAt ?? null,
    lastValidUntil: process.issuedDocs[0]?.validUntil ?? null
  }));

  const countBy = (field: "status" | "licenseType" | "activity" | "analyst" | "district" | "zone" | "size") => {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const value = row[field] || "Não informado";
      grouped.set(value, (grouped.get(value) ?? 0) + 1);
    }
    return [...grouped].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  return res.json({
    rows,
    totals: {
      processes: rows.length,
      issued: rows.reduce((total, row) => total + row.issuedCount, 0),
      decided: rows.filter((row) => row.decidedAt).length
    },
    groups: {
      status: countBy("status"),
      licenseType: countBy("licenseType"),
      activity: countBy("activity"),
      analyst: countBy("analyst"),
      district: countBy("district"),
      zone: countBy("zone"),
      size: countBy("size")
    }
  });
});

reportsRouter.get("/summary", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticação obrigatória" });
  const where = reportWhere(user, req.query);
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
  return res.json({ byStatus, byLicense, byAnalyst, issuedCount: issued.length, issuedAmountCents });
});
