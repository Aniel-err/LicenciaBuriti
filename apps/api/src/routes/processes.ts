import { Router } from "express";
import { LicenseType, ProcessStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { canChangeProcess, processScope } from "../security/access-control.js";
import { recordAudit } from "../security/audit.js";

export const processesRouter = Router();

processesRouter.get("/", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const statusWhere = status && status in ProcessStatus ? { status: status as ProcessStatus } : {};

  const processos = await prisma.process.findMany({
    where: { AND: [processScope(user), statusWhere] },
    orderBy: { openedAt: "desc" },
    include: {
      entrepreneur: true,
      enterprise: { include: { activity: true } },
      analyst: true,
      documents: true,
      messages: { orderBy: { createdAt: "asc" } },
      opinions: { orderBy: { createdAt: "desc" } },
      inspections: { orderBy: { createdAt: "desc" } },
      issuedDocs: { orderBy: { issuedAt: "desc" } },
      history: { orderBy: { createdAt: "asc" } },
      conditions: true
    }
  });

  return res.json(processos);
});

processesRouter.post("/", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const schema = z.object({
    entrepreneurId: z.string(),
    enterpriseId: z.string(),
    licenseType: z.nativeEnum(LicenseType)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do processo invalidos" });

  const year = new Date().getFullYear();
  const count = await prisma.process.count({ where: { number: { startsWith: `${year}.` } } });
  const number = `${year}.${String(count + 1).padStart(6, "0")}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: parsed.data.enterpriseId },
    include: { activity: true, entrepreneur: true }
  });

  if (!enterprise) return res.status(404).json({ error: "Empreendimento nao encontrado" });
  if (enterprise.entrepreneurId !== parsed.data.entrepreneurId) {
    return res.status(400).json({ error: "Empreendimento nao pertence ao empreendedor informado" });
  }
  if (user.role === "EMPREENDEDOR" && enterprise.entrepreneur.userId !== user.id) {
    return res.status(403).json({ error: "Empreendimento fora do seu cadastro" });
  }

  const processo = await prisma.process.create({
    data: {
      ...parsed.data,
      number,
      protocol: `BURITI-${number}`,
      dueDate,
      documents: {
        create: enterprise.activity.requiredDocuments.map((name) => ({ name }))
      },
      history: {
        create: {
          status: ProcessStatus.RECEBIDO,
          description: "Processo recebido e protocolo gerado automaticamente.",
          actorName: req.user?.name ?? "Sistema"
        }
      }
    },
    include: { documents: true, history: true }
  });

  await recordAudit(user, "PROCESS_CREATE", "Process", processo.id, {
    number: processo.number,
    entrepreneurId: parsed.data.entrepreneurId,
    enterpriseId: parsed.data.enterpriseId
  });

  return res.status(201).json(processo);
});

processesRouter.patch("/:id/assign", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ analystId: z.string().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Analista invalido" });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, analystId: true, number: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });

  if (user.role === "ADMIN" && !parsed.data.analystId) {
    return res.status(400).json({ error: "Escolha um analista antes de distribuir o processo." });
  }

  const analystId = user.role === "ANALISTA" ? user.id : parsed.data.analystId;
  const analyst = analystId
    ? await prisma.user.findFirst({ where: { id: analystId, role: "ANALISTA", isActive: true }, select: { id: true, name: true } })
    : null;
  if (analystId && !analyst) return res.status(400).json({ error: "Analista invalido ou inativo" });

  const processo = await prisma.process.update({
    where: { id: processId },
    data: {
      analystId,
      status: ProcessStatus.EM_ANALISE,
      history: {
        create: {
          status: ProcessStatus.EM_ANALISE,
          description: analyst ? `Processo distribuido para ${analyst.name}.` : "Processo removido da fila de analise.",
          actorName: user.name
        }
      }
    },
    include: {
      entrepreneur: true,
      enterprise: { include: { activity: true } },
      analyst: true,
      documents: true,
      messages: { orderBy: { createdAt: "asc" } },
      opinions: { orderBy: { createdAt: "desc" } },
      inspections: { orderBy: { createdAt: "desc" } },
      issuedDocs: { orderBy: { issuedAt: "desc" } },
      history: { orderBy: { createdAt: "asc" } },
      conditions: true
    }
  });

  await recordAudit(user, "PROCESS_ASSIGN", "Process", processId, { analystId, number: existing.number });
  return res.json(processo);
});

processesRouter.patch("/:id/status", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ status: z.nativeEnum(ProcessStatus), description: z.string().min(3) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status invalido" });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, analystId: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, existing)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });

  const processo = await prisma.process.update({
    where: { id: processId },
    data: {
      status: parsed.data.status,
      history: {
        create: {
          status: parsed.data.status,
          description: parsed.data.description,
          actorName: req.user?.name ?? "Sistema"
        }
      }
    },
    include: { history: { orderBy: { createdAt: "asc" } } }
  });

  await recordAudit(user, "PROCESS_STATUS", "Process", processId, {
    status: parsed.data.status,
    description: parsed.data.description
  });

  return res.json(processo);
});

processesRouter.post("/:id/messages", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ content: z.string().trim().min(3).max(4000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Mensagem invalida" });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, number: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });

  const message = await prisma.message.create({
    data: { processId, senderName: user.name, content: parsed.data.content }
  });

  await recordAudit(user, "PROCESS_MESSAGE", "Process", processId, { messageId: message.id, number: existing.number });
  return res.status(201).json(message);
});

processesRouter.post("/:id/documents", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({ name: z.string().trim().min(3).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Documento invalido" });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, analystId: true, number: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, existing)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });

  const document = await prisma.document.create({ data: { processId, name: parsed.data.name } });
  await prisma.process.update({
    where: { id: processId },
    data: {
      status: ProcessStatus.AGUARDANDO_DOCUMENTOS,
      history: {
        create: {
          status: ProcessStatus.AGUARDANDO_DOCUMENTOS,
          description: `Complementacao solicitada: ${parsed.data.name}`,
          actorName: user.name
        }
      }
    }
  });
  await recordAudit(user, "DOCUMENT_REQUEST", "Process", processId, { documentId: document.id, number: existing.number });
  return res.status(201).json(document);
});

processesRouter.post("/:id/opinions", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    conclusion: z.string().trim().min(3).max(200),
    content: z.string().trim().min(10).max(12000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Parecer invalido" });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, analystId: true, number: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, existing)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });

  const opinion = await prisma.opinion.create({
    data: {
      processId,
      authorId: user.id,
      conclusion: parsed.data.conclusion,
      content: parsed.data.content
    }
  });

  await prisma.process.update({
    where: { id: processId },
    data: {
      status: ProcessStatus.EM_ANALISE,
      history: {
        create: {
          status: ProcessStatus.EM_ANALISE,
          description: `Parecer tecnico registrado: ${parsed.data.conclusion}`,
          actorName: user.name
        }
      }
    }
  });

  await recordAudit(user, "PROCESS_OPINION", "Process", processId, { opinionId: opinion.id, number: existing.number });
  return res.status(201).json(opinion);
});
