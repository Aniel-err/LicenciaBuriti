import { createHmac, randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { ProcessStatus, type Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { config } from "../config.js";
import { resolveManagedFile, saveManagedFile } from "../documents/storage.js";
import { addDaysFromNow, findLicenseRule } from "../licensing/rules.js";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { canChangeProcess, processScope } from "../security/access-control.js";
import { auditContext, recordAudit } from "../security/audit.js";

const officialTypes = ["LICENCA", "CERTIDAO", "DECLARACAO", "AUTORIZACAO", "OFICIO", "NOTIFICACAO", "PARECER"] as const;
type OfficialType = typeof officialTypes[number];

const typeConfig: Record<OfficialType, { prefix: string; title: string; templateType: string }> = {
  LICENCA: { prefix: "LIC", title: "Licença Ambiental Municipal", templateType: "Licença" },
  CERTIDAO: { prefix: "CER", title: "Certidão Ambiental", templateType: "Certidão" },
  DECLARACAO: { prefix: "DEC", title: "Declaração Ambiental", templateType: "Declaração" },
  AUTORIZACAO: { prefix: "AUT", title: "Autorização Ambiental", templateType: "Autorização" },
  OFICIO: { prefix: "OFI", title: "Ofício", templateType: "Ofício" },
  NOTIFICACAO: { prefix: "NOT", title: "Notificação", templateType: "Notificação" },
  PARECER: { prefix: "PAR", title: "Parecer Técnico", templateType: "Parecer" }
};

const issueSchema = z.object({
  type: z.enum(officialTypes).default("LICENCA"),
  validUntil: z.coerce.date().optional(),
  templateId: z.string().optional(),
  subject: z.string().trim().max(500).optional(),
  body: z.string().trim().max(30000).optional(),
  conditions: z.array(z.union([
    z.string().trim().min(3),
    z.object({ description: z.string().trim().min(3), dueDate: z.coerce.date().optional() })
  ])).default([])
});

export const officialDocumentsRouter = Router();

async function nextDocumentNumber(type: OfficialType, tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const prefix = typeConfig[type].prefix;
  const sequence = await tx.documentSequence.upsert({
    where: { year_prefix: { year, prefix } },
    create: { year, prefix, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } }
  });
  return `${prefix}-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

function applyVariables(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
    template
  );
}

async function renderOfficialPdf(input: {
  title: string;
  number: string;
  processNumber: string;
  protocol: string;
  entrepreneur: string;
  enterprise: string;
  licenseType: string;
  subject?: string;
  content: string;
  validUntil?: Date;
  conditions: Array<{ description: string; dueDate: Date }>;
  signedBy: string;
  validationCode: string;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 48, size: "A4", info: { Title: `${input.title} ${input.number}` } });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.fontSize(10).fillColor("#51645a").text("PREFEITURA MUNICIPAL DE BURITI - MA", { align: "center" });
    pdf.fontSize(9).text("Secretaria Municipal de Meio Ambiente e Turismo", { align: "center" });
    pdf.moveDown(1.3);
    pdf.fillColor("#10261b").fontSize(18).text(input.title, { align: "center" });
    pdf.fontSize(12).text(`Nº ${input.number}`, { align: "center" });
    pdf.moveDown(1.5);
    pdf.fontSize(10).text(`Processo: ${input.processNumber}`);
    pdf.text(`Protocolo: ${input.protocol}`);
    pdf.text(`Empreendedor: ${input.entrepreneur}`);
    pdf.text(`Empreendimento: ${input.enterprise}`);
    pdf.text(`Ato solicitado: ${input.licenseType}`);
    if (input.validUntil) pdf.text(`Validade: ${input.validUntil.toLocaleDateString("pt-BR")}`);
    if (input.subject) {
      pdf.moveDown();
      pdf.fontSize(11).text(`Assunto: ${input.subject}`);
    }
    pdf.moveDown();
    pdf.fontSize(11).text(input.content, { align: "justify", lineGap: 3 });
    if (input.conditions.length) {
      pdf.moveDown();
      pdf.fontSize(12).text("Condicionantes", { underline: true });
      input.conditions.forEach((condition, index) => {
        pdf.fontSize(10).text(`${index + 1}. ${condition.description} - prazo: ${condition.dueDate.toLocaleDateString("pt-BR")}`);
      });
    }
    pdf.moveDown(2);
    pdf.fontSize(9).text(`Assinado eletronicamente por ${input.signedBy} em ${new Date().toLocaleString("pt-BR")}`, { align: "center" });
    pdf.text(`Código de validação: ${input.validationCode}`, { align: "center" });
    pdf.text(`Validação pública: ${config.appUrl.replace(/\/$/, "")}/validar-documento`, { align: "center" });
    pdf.end();
  });
}

async function issueDocument(req: Request, res: Response) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de emissao invalidos", details: parsed.error.flatten() });
  const processId = z.string().min(1).parse(req.params.id);
  const licProcess = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    include: {
      documents: true,
      entrepreneur: true,
      enterprise: true,
      opinions: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  if (!licProcess) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, licProcess)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  if (licProcess.status === ProcessStatus.INDEFERIDO || licProcess.status === ProcessStatus.ARQUIVADO) {
    return res.status(409).json({ error: "Processo encerrado nao permite emissao de documento" });
  }

  const isDecisionDocument = ["LICENCA", "AUTORIZACAO", "CERTIDAO", "DECLARACAO"].includes(parsed.data.type);
  if (isDecisionDocument) {
    const invalidDocuments = licProcess.documents.filter((document) => document.status !== "VALIDADO");
    if (invalidDocuments.length) {
      return res.status(409).json({ error: "Todos os documentos obrigatorios devem estar validados antes da emissao" });
    }
  }
  const rule = await findLicenseRule(licProcess.licenseType);
  if (isDecisionDocument && rule?.requiresInspection) {
    const validatedInspection = await prisma.inspection.findFirst({
      where: { processId: licProcess.id, status: "VALIDADA" },
      select: { id: true }
    });
    if (!validatedInspection) return res.status(409).json({ error: "Este tipo de ato exige vistoria validada antes da emissao" });
  }

  const definition = typeConfig[parsed.data.type];
  const validUntil = parsed.data.validUntil ?? (isDecisionDocument ? addDaysFromNow(rule?.validityDays ?? 365) : undefined);
  const conditions = parsed.data.conditions.map((condition) => typeof condition === "string"
    ? { description: condition, dueDate: validUntil ?? addDaysFromNow(30) }
    : { description: condition.description, dueDate: condition.dueDate ?? validUntil ?? addDaysFromNow(30) });
  const template = parsed.data.templateId
    ? await prisma.documentTemplate.findFirst({ where: { id: parsed.data.templateId, isActive: true } })
    : await prisma.documentTemplate.findFirst({ where: { type: definition.templateType, isActive: true }, orderBy: { createdAt: "desc" } });
  const opinionContent = parsed.data.type === "PARECER" ? licProcess.opinions[0]?.content : undefined;
  const defaultContent = parsed.data.body || opinionContent || `${definition.title} emitido conforme análise do processo administrativo ambiental.`;
  const content = applyVariables(template?.content || defaultContent, {
    processo: licProcess.number,
    protocolo: licProcess.protocol,
    empreendedor: licProcess.entrepreneur.name,
    empreendimento: licProcess.enterprise.name,
    tipo_licenca: licProcess.licenseType
  });
  const validationCode = randomBytes(24).toString("base64url");
  const number = await prisma.$transaction((tx) => nextDocumentNumber(parsed.data.type, tx));
  const pdfBuffer = await renderOfficialPdf({
    title: definition.title,
    number,
    processNumber: licProcess.number,
    protocol: licProcess.protocol,
    entrepreneur: licProcess.entrepreneur.name,
    enterprise: licProcess.enterprise.name,
    licenseType: licProcess.licenseType,
    subject: parsed.data.subject,
    content,
    validUntil,
    conditions,
    signedBy: user.name,
    validationCode
  });
  const stored = await saveManagedFile("official-documents", processId, `${number}.pdf`, pdfBuffer);
  const signatureAlgorithm = "HMAC-SHA256";
  const signature = createHmac("sha256", config.documentSigningSecret || config.jwtSecret)
    .update(stored.fileSha256)
    .digest("base64url");
  const signedAt = new Date();

  const issued = await prisma.$transaction(async (tx) => {
    const document = await tx.issuedDocument.create({
      data: {
        processId,
        type: parsed.data.type,
        number,
        validationCode,
        fileName: stored.fileName,
        filePath: stored.filePath,
        storageKey: stored.storageKey,
        fileSha256: stored.fileSha256,
        signature,
        signatureAlgorithm,
        signedBy: user.name,
        signedAt,
        validUntil
      }
    });
    await tx.process.update({
      where: { id: processId },
      data: {
        status: isDecisionDocument ? ProcessStatus.DEFERIDO : undefined,
        decidedAt: isDecisionDocument ? signedAt : undefined,
        publicSummary: parsed.data.subject || undefined,
        conditions: conditions.length ? { create: conditions } : undefined,
        history: {
          create: {
            status: isDecisionDocument ? ProcessStatus.DEFERIDO : licProcess.status,
            description: `${definition.title} ${number} emitido.`,
            actorName: user.name
          }
        }
      }
    });
    return document;
  });

  await recordAudit(user, "OFFICIAL_DOCUMENT_ISSUE", "IssuedDocument", issued.id, {
    processId,
    type: parsed.data.type,
    number,
    fileSha256: stored.fileSha256,
    signatureAlgorithm,
    validUntil: validUntil?.toISOString()
  }, auditContext(req, { status: licProcess.status }, { status: isDecisionDocument ? ProcessStatus.DEFERIDO : licProcess.status, number }));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${number}.pdf"`);
  return res.send(pdfBuffer);
}

officialDocumentsRouter.post("/processes/:id", requireAuth, allowRoles("ADMIN", "ANALISTA"), issueDocument);
officialDocumentsRouter.post("/processes/:id/license", requireAuth, allowRoles("ADMIN", "ANALISTA"), (req, res) => {
  req.body = { ...req.body, type: "LICENCA" };
  return issueDocument(req, res);
});

officialDocumentsRouter.get("/:id/download", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });
  const id = z.string().min(1).parse(req.params.id);
  const document = await prisma.issuedDocument.findFirst({
    where: { id, process: processScope(user) },
    select: { id: true, processId: true, number: true, fileName: true, filePath: true }
  });
  const resolved = resolveManagedFile(document?.filePath);
  if (!document || !resolved) return res.status(404).json({ error: "Documento emitido nao encontrado" });
  try {
    await access(resolved);
  } catch {
    return res.status(404).json({ error: "Arquivo do documento emitido nao encontrado" });
  }
  await recordAudit(user, "OFFICIAL_DOCUMENT_DOWNLOAD", "IssuedDocument", document.id, { processId: document.processId });
  return res.download(resolved, document.fileName ?? `${document.number}${path.extname(resolved) || ".pdf"}`);
});
