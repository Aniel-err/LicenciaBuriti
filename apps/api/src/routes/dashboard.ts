import { Router } from "express";
import { ProcessStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { processScope } from "../security/access-control.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(now.getDate() + 30);
  const scopedWhere = processScope(user);

  const [total, emAnalise, aguardando, deferidos, indeferidos, emitidas, vencendo, vencidas, recentes, porStatus, porAnalista, porAtividade, proximasCondicionantes, datasAbertura] = await Promise.all([
    prisma.process.count({ where: scopedWhere }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.EM_ANALISE }] } }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.AGUARDANDO_DOCUMENTOS }] } }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.DEFERIDO }] } }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.INDEFERIDO }] } }),
    prisma.issuedDocument.count({ where: { process: { is: scopedWhere } } }),
    prisma.issuedDocument.count({ where: { validUntil: { gte: now, lte: in30Days }, process: { is: scopedWhere } } }),
    prisma.issuedDocument.count({ where: { validUntil: { lt: now }, process: { is: scopedWhere } } }),
    prisma.process.findMany({
      where: scopedWhere,
      take: 8,
      orderBy: { openedAt: "desc" },
      include: {
        entrepreneur: true,
        enterprise: true,
        analyst: true,
        documents: true
      }
    }),
    prisma.process.groupBy({ by: ["status"], where: scopedWhere, _count: true }),
    prisma.process.groupBy({ by: ["analystId"], where: scopedWhere, _count: true }),
    prisma.process.groupBy({ by: ["enterpriseId"], where: scopedWhere, _count: true }),
    prisma.condition.findMany({
      where: { dueDate: { gte: now, lte: in30Days }, status: { not: "CUMPRIDA" }, process: { is: scopedWhere } },
      orderBy: { dueDate: "asc" },
      take: 10,
      include: { process: { select: { id: true, number: true } } }
    }),
    prisma.process.findMany({ where: scopedWhere, select: { openedAt: true } })
  ]);

  const [analysts, enterprises] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: porAnalista.map((item) => item.analystId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true }
    }),
    prisma.enterprise.findMany({
      where: { id: { in: porAtividade.map((item) => item.enterpriseId) } },
      select: { id: true, activity: { select: { description: true } } }
    })
  ]);
  const analystNames = new Map(analysts.map((item) => [item.id, item.name]));
  const activityCounts = new Map<string, number>();
  const activityByEnterprise = new Map(enterprises.map((item) => [item.id, item.activity.description]));
  for (const item of porAtividade) {
    const activity = activityByEnterprise.get(item.enterpriseId) ?? "Não informada";
    activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + item._count);
  }
  const monthCounts = new Map<string, number>();
  for (const item of datasAbertura) {
    const key = `${item.openedAt.getUTCFullYear()}-${String(item.openedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }

  return res.json({
    metrics: { total, emAnalise, aguardando, deferidos, indeferidos, emitidas, vencendo, vencidas },
    groups: {
      status: porStatus.map((item) => ({ name: item.status, count: item._count })),
      analyst: porAnalista.map((item) => ({ name: item.analystId ? analystNames.get(item.analystId) ?? "Analista" : "Não distribuído", count: item._count })),
      activity: [...activityCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      month: [...monthCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
    },
    deadlines: proximasCondicionantes,
    processos: recentes
  });
});
