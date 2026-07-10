import { Router } from "express";
import PDFDocument from "pdfkit";
import { randomBytes } from "node:crypto";
import { ProcessStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { canChangeProcess, processScope } from "../security/access-control.js";
import { auditContext, recordAudit } from "../security/audit.js";
import { addDaysFromNow, findLicenseRule } from "../licensing/rules.js";

export const officialDocumentsRouter = Router();

officialDocumentsRouter.post("/processes/:id/license", requireAuth, allowRoles("ADMIN", "ANALISTA"), async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Autenticacao obrigatoria" });

  const parsed = z.object({
    validUntil: z.coerce.date().optional(),
    conditions: z.array(z.string()).default([])
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Dados de emissao invalidos" });

  const processId = z.string().min(1).parse(req.params.id);
  const licProcess = await prisma.process.findFirst({
    where: { id: processId, AND: [processScope(user)] },
    include: { documents: true }
  });
  if (!licProcess) return res.status(404).json({ error: "Processo nao encontrado" });
  if (!canChangeProcess(user, licProcess)) return res.status(403).json({ error: "Processo nao atribuido a este analista" });
  if (licProcess.status === ProcessStatus.INDEFERIDO || licProcess.status === ProcessStatus.ARQUIVADO) {
    return res.status(409).json({ error: "Processo encerrado nao permite emissao de licenca" });
  }
  const invalidDocuments = licProcess.documents.filter((doc) => doc.status !== "VALIDADO");
  if (invalidDocuments.length > 0) {
    return res.status(409).json({ error: "Todos os documentos obrigatorios devem estar validados antes da emissao" });
  }
  const rule = await findLicenseRule(licProcess.licenseType);
  if (rule?.requiresInspection) {
    const validatedInspection = await prisma.inspection.findFirst({
      where: { processId: licProcess.id, status: "VALIDADA" },
      select: { id: true }
    });
    if (!validatedInspection) return res.status(409).json({ error: "Este tipo de ato exige vistoria validada antes da emissao" });
  }
  const validUntil: Date = parsed.data.validUntil ?? addDaysFromNow(rule?.validityDays ?? 365);

  const [entrepreneur, enterprise] = await Promise.all([
    prisma.entrepreneur.findUnique({ where: { id: licProcess.entrepreneurId } }),
    prisma.enterprise.findUnique({ where: { id: licProcess.enterpriseId } })
  ]);

  const count = await prisma.issuedDocument.count();
  const number = `LIC-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;
  const validationCode = randomBytes(18).toString("base64url");
  await prisma.issuedDocument.create({
    data: {
      processId: licProcess.id,
      type: rule?.displayName ?? "Licenca Ambiental",
      number,
      validationCode,
      signedBy: user.name,
      validUntil
    }
  });

  await prisma.process.update({
    where: { id: licProcess.id },
    data: {
      status: "DEFERIDO",
      conditions: {
        create: parsed.data.conditions.map((description) => ({
          description,
          dueDate: validUntil
        }))
      },
      history: {
        create: {
          status: "DEFERIDO",
          description: `Licenca ambiental ${number} emitida`,
          actorName: user.name
        }
      }
    }
  });

  await recordAudit(user, "LICENSE_ISSUE", "Process", licProcess.id, {
    number,
    validationCode,
    validUntil: validUntil.toISOString()
  }, auditContext(req, { status: licProcess.status }, { status: "DEFERIDO", licenseNumber: number }));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${number}.pdf"`);

  const pdf = new PDFDocument({ margin: 48 });
  pdf.pipe(res);
  pdf.fontSize(18).text("Licenca Ambiental Municipal", { align: "center" });
  pdf.moveDown();
  pdf.fontSize(12).text(`Numero: ${number}`);
  pdf.text(`Processo: ${licProcess.number}`);
  pdf.text(`Empreendedor: ${entrepreneur?.name ?? licProcess.entrepreneurId}`);
  pdf.text(`Empreendimento: ${enterprise?.name ?? licProcess.enterpriseId}`);
  pdf.text(`Tipo de licenca: ${licProcess.licenseType}`);
  pdf.text(`Validade: ${validUntil.toLocaleDateString("pt-BR")}`);
  pdf.moveDown();
  pdf.text("Condicionantes:");
  parsed.data.conditions.forEach((condition, index) => pdf.text(`${index + 1}. ${condition}`));
  pdf.moveDown();
  pdf.text(`Assinado eletronicamente por ${user.name} em ${new Date().toLocaleString("pt-BR")}`);
  pdf.text(`Codigo de validacao publica: ${validationCode}`);
  pdf.text(`Consulta publica: /public/licenses/${validationCode}`);
  pdf.end();
});
