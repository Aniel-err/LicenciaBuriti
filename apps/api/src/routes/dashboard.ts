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

  const [total, emAnalise, aguardando, deferidos, vencendo, recentes] = await Promise.all([
    prisma.process.count({ where: scopedWhere }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.EM_ANALISE }] } }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.AGUARDANDO_DOCUMENTOS }] } }),
    prisma.process.count({ where: { AND: [scopedWhere, { status: ProcessStatus.DEFERIDO }] } }),
    prisma.issuedDocument.count({ where: { validUntil: { gte: now, lte: in30Days }, process: { is: scopedWhere } } }),
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
    })
  ]);

  return res.json({
    metrics: { total, emAnalise, aguardando, deferidos, vencendo },
    processos: recentes
  });
});
