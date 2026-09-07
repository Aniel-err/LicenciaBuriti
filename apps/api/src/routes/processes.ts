import { Router } from "express";
import { ConditionStatus, LicenseType, ProcessStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { canChangeProcess, processScope } from "../security/access-control.js";
import { auditContext, recordAudit } from "../security/audit.js";
import { addDaysFromNow, findLicenseRule, nextProcessNumber, requiredDocumentsFor } from "../licensing/rules.js";

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
      opinions: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
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
  if (!enterprise.activity.requiredLicenses.includes(parsed.data.licenseType)) {
    return res.status(400).json({ error: "Tipo de ato nao permitido para esta atividade" });
  }

  const processo = await prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const rule = await findLicenseRule(parsed.data.licenseType, tx);
    const number = await nextProcessNumber(year, tx);
    const documentNames = requiredDocumentsFor(enterprise.activity.requiredDocuments, rule?.requiredDocuments ?? []);

    return tx.process.create({
      data: {
        ...parsed.data,
        number,
        protocol: `BURITI-${number}`,
        dueDate: addDaysFromNow(rule?.deadlineDays ?? 30),
        documents: {
          create: documentNames.map((name) => ({ name }))
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
  });

  await recordAudit(user, "PROCESS_CREATE", "Process", processo.id, {
    number: processo.number,
    entrepreneurId: parsed.data.entrepreneurId,
    enterpriseId: parsed.data.enterpriseId
  }, auditContext(req, undefined, {
    number: processo.number,
    protocol: processo.protocol,
    status: processo.status,
    licenseType: processo.licenseType
  }));

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
      opinions: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
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
      decidedAt: parsed.data.status === ProcessStatus.DEFERIDO || parsed.data.status === ProcessStatus.INDEFERIDO
        ? new Date()
        : parsed.data.status === ProcessStatus.EM_ANALISE
          ? null
          : undefined,
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

processesRouter.post("/:id/conditions", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const processId = z.string().min(1).parse(req.params.id);
  const parsed = z.object({
    description: z.string().trim().min(5).max(4000),
    dueDate: z.coerce.date(),
    notes: z.string().trim().max(4000).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Condicionante invalida", details: parsed.error.flatten() });

  const existing = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    select: { id: true, analystId: true, number: true, status: true }
  });
  if (!existing) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, existing)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });

  const condition = await prisma.condition.create({ data: { processId, ...parsed.data } });
  await prisma.processHistory.create({
    data: {
      processId,
      status: existing.status,
      description: `Condicionante registrada com prazo em ${condition.dueDate.toLocaleDateString("pt-BR")}.`,
      actorName: user.name
    }
  });
  await recordAudit(user, "CONDITION_CREATE", "Condition", condition.id, { processId, number: existing.number });
  return res.status(201).json(condition);
});

processesRouter.patch("/:id/conditions/:conditionId", requireAuth, allowRoles("ANALISTA", "ADMIN", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const processId = z.string().min(1).parse(req.params.id);
  const conditionId = z.string().min(1).parse(req.params.conditionId);
  const parsed = z.object({
    status: z.nativeEnum(ConditionStatus),
    notes: z.string().trim().max(4000).optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Situacao da condicionante invalida" });
  if (user.role === "EMPREENDEDOR" && parsed.data.status !== ConditionStatus.EM_CUMPRIMENTO) {
    return res.status(403).json({ error: "O empreendedor pode apenas informar que a condicionante esta em cumprimento" });
  }

  const existing = await prisma.condition.findFirst({
    where: { id: conditionId, processId, process: processScope(user) },
    include: { process: { select: { status: true, analystId: true, number: true } } }
  });
  if (!existing) return res.status(404).json({ error: "Condicionante nao encontrada" });
  if (user.role === "ANALISTA" && !canChangeProcess(user, existing.process)) {
    return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  }

  const condition = await prisma.condition.update({
    where: { id: conditionId },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes,
      completedAt: parsed.data.status === ConditionStatus.CUMPRIDA ? new Date() : null
    }
  });
  await prisma.processHistory.create({
    data: {
      processId,
      status: existing.process.status,
      description: `Condicionante atualizada para ${condition.status}.`,
      actorName: user.name
    }
  });
  await recordAudit(user, "CONDITION_STATUS", "Condition", conditionId, {
    processId,
    number: existing.process.number,
    status: condition.status
  });
  return res.json(condition);
});

processesRouter.delete("/:id/conditions/:conditionId", requireAuth, allowRoles("ANALISTA", "ADMIN"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const processId = z.string().min(1).parse(req.params.id);
  const conditionId = z.string().min(1).parse(req.params.conditionId);
  const existing = await prisma.condition.findFirst({
    where: { id: conditionId, processId, process: processScope(user) },
    include: { process: { select: { analystId: true } } }
  });
  if (!existing) return res.status(404).json({ error: "Condicionante nao encontrada" });
  if (!canChangeProcess(user, existing.process)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  await prisma.condition.delete({ where: { id: conditionId } });
  await recordAudit(user, "CONDITION_DELETE", "Condition", conditionId, { processId });
  return res.status(204).send();
});

processesRouter.post("/:id/renew", requireAuth, allowRoles("ADMIN", "ANALISTA", "EMPREENDEDOR"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const sourceId = z.string().min(1).parse(req.params.id);
  const source = await prisma.process.findFirst({
    where: { id: sourceId, AND: [processScope(user)] },
    include: {
      enterprise: { include: { activity: true } },
      issuedDocs: { orderBy: { issuedAt: "desc" }, take: 1 }
    }
  });
  if (!source) return res.status(404).json({ error: "Processo de origem nao encontrado" });
  if (!source.issuedDocs[0]) return res.status(409).json({ error: "A renovacao exige uma licenca emitida no processo de origem" });
  const existingRenewal = await prisma.process.findFirst({
    where: { renewalOfId: sourceId, status: { notIn: [ProcessStatus.ARQUIVADO, ProcessStatus.INDEFERIDO] } },
    select: { id: true, number: true }
  });
  if (existingRenewal) return res.status(409).json({ error: `Ja existe uma renovacao ativa: ${existingRenewal.number}` });

  const renewal = await prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const rule = await findLicenseRule(LicenseType.RENOVACAO, tx);
    const number = await nextProcessNumber(year, tx);
    const documentNames = requiredDocumentsFor(
      [...source.enterprise.activity.requiredDocuments, "Licenca ambiental anterior"],
      rule?.requiredDocuments ?? []
    );
    return tx.process.create({
      data: {
        number,
        protocol: `BURITI-${number}`,
        entrepreneurId: source.entrepreneurId,
        enterpriseId: source.enterpriseId,
        licenseType: LicenseType.RENOVACAO,
        renewalOfId: source.id,
        dueDate: addDaysFromNow(rule?.deadlineDays ?? 30),
        documents: { create: documentNames.map((name) => ({ name })) },
        history: {
          create: {
            status: ProcessStatus.RECEBIDO,
            description: `Pedido de renovacao originado do processo ${source.number}.`,
            actorName: user.name
          }
        }
      },
      include: { documents: true, history: true }
    });
  });
  await recordAudit(user, "PROCESS_RENEW", "Process", renewal.id, {
    sourceProcessId: source.id,
    sourceNumber: source.number,
    number: renewal.number
  });
  return res.status(201).json(renewal);
});
