import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const publicRouter = Router();

function publicStatusLabel(status: string, hasLicense: boolean) {
  if (hasLicense) return "Licenca emitida";
  const map: Record<string, string> = {
    RECEBIDO: "Recebido",
    EM_ANALISE: "Em analise",
    AGUARDANDO_DOCUMENTOS: "Aguardando documentos",
    DEFERIDO: "Deferido",
    INDEFERIDO: "Indeferido",
    ARQUIVADO: "Arquivado"
  };
  return map[status] ?? "Recebido";
}

publicRouter.get("/processes", async (req, res) => {
  const config = await prisma.systemConfig.findUnique({ where: { id: "default" }, select: { publicSearchEnabled: true } });
  if (config && !config.publicSearchEnabled) return res.json([]);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json([]);
  if (q.length < 5) return res.json([]);

  const processos = await prisma.process.findMany({
    where: {
      OR: [
        { number: { equals: q, mode: "insensitive" } },
        { protocol: { equals: q, mode: "insensitive" } },
        { enterprise: { name: { contains: q, mode: "insensitive" } } }
      ]
    },
    take: 10,
    include: {
      entrepreneur: true,
      enterprise: true,
      issuedDocs: { orderBy: { issuedAt: "desc" }, take: 1 }
    }
  });

  return res.json(processos.map((processo) => {
    const issuedDocument = processo.issuedDocs[0];
    return {
      number: processo.number,
      enterprise: processo.enterprise.name,
      entrepreneur: processo.entrepreneur.name,
      licenseType: processo.licenseType,
      status: publicStatusLabel(processo.status, Boolean(issuedDocument)),
      validUntil: issuedDocument?.validUntil,
      summary: processo.publicSummary
    };
  }));
});

publicRouter.get("/news", async (_req, res) => {
  const news = await prisma.news.findMany({ where: { isPublished: true }, orderBy: { publishedAt: "desc" } });
  return res.json(news);
});
