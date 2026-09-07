import { createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
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

const require = createRequire(import.meta.url);
const officialFontRegular = require.resolve("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff");
const officialFontSemibold = require.resolve("@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff");

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
    const pdf = new PDFDocument({
      margin: 52,
      size: "A4",
      info: {
        Title: `${input.title} ${input.number}`,
        Author: "Prefeitura Municipal de Buriti - MA",
        Subject: input.subject || input.title,
        Creator: "Licencia Buriti"
      }
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.registerFont("NotoSans", officialFontRegular);
    pdf.registerFont("NotoSans-Semibold", officialFontSemibold);
    pdf.font("NotoSans");

    const contentWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const infoLine = (label: string, value: string) => {
      pdf.font("NotoSans-Semibold").text(`${label}: `, { continued: true });
      pdf.font("NotoSans").text(value);
    };

    pdf.font("NotoSans-Semibold").fontSize(10).fillColor("#486056")
      .text("PREFEITURA MUNICIPAL DE BURITI - MA", { align: "center", characterSpacing: 0.25 });
    pdf.font("NotoSans").fontSize(9)
      .text("Secretaria Municipal de Meio Ambiente e Turismo", { align: "center" });
    pdf.moveDown(0.8);
    pdf.moveTo(pdf.page.margins.left, pdf.y)
      .lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
      .lineWidth(0.8)
      .strokeColor("#b9c8c0")
      .stroke();
    pdf.moveDown(1.2);
    pdf.font("NotoSans-Semibold").fillColor("#10261b").fontSize(19)
      .text(input.title, { align: "center" });
    pdf.font("NotoSans").fontSize(11).text(`Nº ${input.number}`, { align: "center" });
    pdf.moveDown(1.7);
    pdf.fontSize(9.5).fillColor("#1d2c25");
    infoLine("Processo", input.processNumber);
    infoLine("Protocolo", input.protocol);
    infoLine("Empreendedor", input.entrepreneur);
    infoLine("Empreendimento", input.enterprise);
    infoLine("Ato solicitado", input.licenseType);
    if (input.validUntil) infoLine("Validade", input.validUntil.toLocaleDateString("pt-BR"));
    if (input.subject) {
      pdf.moveDown();
      pdf.font("NotoSans-Semibold").fontSize(10.5).text("Assunto", { underline: true });
      pdf.font("NotoSans").fontSize(10.5).text(input.subject);
    }
    pdf.moveDown();
    pdf.font("NotoSans").fontSize(10.5).text(input.content, { align: "justify", lineGap: 3 });
    if (input.conditions.length) {
      pdf.moveDown();
      pdf.font("NotoSans-Semibold").fontSize(11).text("Condicionantes", { underline: true });
      input.conditions.forEach((condition, index) => {
        pdf.font("NotoSans").fontSize(9.5)
          .text(`${index + 1}. ${condition.description} - prazo: ${condition.dueDate.toLocaleDateString("pt-BR")}`);
      });
    }
    pdf.moveDown(2.4);
    if (pdf.y > pdf.page.height - pdf.page.margins.bottom - 105) pdf.addPage();
    const signatureY = pdf.y;
    pdf.moveTo(pdf.page.margins.left + 82, signatureY)
      .lineTo(pdf.page.width - pdf.page.margins.right - 82, signatureY)
      .lineWidth(0.7)
      .strokeColor("#9aaba2")
      .stroke();
    pdf.y = signatureY + 8;
    pdf.font("NotoSans").fillColor("#25372e").fontSize(8.5)
      .text(`Assinado eletronicamente por ${input.signedBy}`, { align: "center", width: contentWidth });
    pdf.fontSize(8).text(`Em ${new Date().toLocaleString("pt-BR")}`, { align: "center", width: contentWidth });
    pdf.moveDown(0.65);
    pdf.font("NotoSans-Semibold").fontSize(8).text("Código de validação", { align: "center", width: contentWidth });
    pdf.font("NotoSans").fontSize(7.5)
      .text(input.validationCode, { align: "center", width: contentWidth, characterSpacing: 0.15 });
    const validationUrl = `${config.appUrl.replace(/\/$/, "")}/validar-documento`;
    pdf.moveDown(0.4);
    pdf.fillColor("#146c4a").fontSize(7.5)
      .text(`Validação pública: ${validationUrl}`, {
        align: "center",
        width: contentWidth,
        link: validationUrl,
        underline: true
      });
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
