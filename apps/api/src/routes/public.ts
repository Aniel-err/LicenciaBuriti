import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const publicRouter = Router();

function publicStatusLabel(status: string, hasLicense: boolean) {
  if (hasLicense) return "Licença emitida";
  const map: Record<string, string> = {
    RECEBIDO: "Recebido",
    EM_ANALISE: "Em análise",
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
  const compact = q.replace(/\D/g, "");
  const identityTerms = Array.from(new Set([q, compact].filter((term) => term.length >= 11)));
  const identityWhere: Prisma.ProcessWhereInput[] = identityTerms.flatMap((term) => [
    { entrepreneur: { cpf: { equals: term, mode: "insensitive" } } },
    { entrepreneur: { cnpj: { equals: term, mode: "insensitive" } } }
  ]);

  const processos = await prisma.process.findMany({
    where: {
      OR: [
        { number: { equals: q, mode: "insensitive" } },
        { protocol: { equals: q, mode: "insensitive" } },
        { enterprise: { name: { contains: q, mode: "insensitive" } } },
        ...identityWhere
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

publicRouter.get("/licenses/:code", async (req, res) => {
  const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(code)) return res.status(400).json({ error: "Codigo de validacao invalido" });

  const issuedDocument = await prisma.issuedDocument.findUnique({
    where: { validationCode: code },
    include: {
      process: {
        include: {
          entrepreneur: true,
          enterprise: true
        }
      }
    }
  });
  if (!issuedDocument) return res.status(404).json({ error: "Licenca nao encontrada" });

  return res.json({
    number: issuedDocument.number,
    type: issuedDocument.type,
    issuedAt: issuedDocument.issuedAt,
    validUntil: issuedDocument.validUntil,
    signedBy: issuedDocument.signedBy,
    process: issuedDocument.process.number,
    protocol: issuedDocument.process.protocol,
    enterprise: issuedDocument.process.enterprise.name,
    entrepreneur: issuedDocument.process.entrepreneur.name,
    status: publicStatusLabel(issuedDocument.process.status, true)
  });
});

publicRouter.get("/news", async (_req, res) => {
  const news = await prisma.news.findMany({ where: { isPublished: true }, orderBy: { publishedAt: "desc" } });
  return res.json(news);
});
