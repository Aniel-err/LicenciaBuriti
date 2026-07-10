import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, LicenseType, ProcessStatus, UserRole } from "@prisma/client";
import { logger } from "../src/security/logger.js";

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(seedPassword, 10);
  if (!process.env.SEED_ADMIN_PASSWORD?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SEED_ADMIN_PASSWORD deve ser definido em producao.");
    }
    logger.warn({ action: "SEED_TEMP_PASSWORD_CREATED" }, "seed_password_generated");
  }

  const [admin, analista, fiscal, empreendedorUser] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@buriti.ma.gov.br" },
      update: { passwordHash, isActive: true },
      create: { name: "Aline Carvalho", email: "admin@buriti.ma.gov.br", passwordHash, role: UserRole.ADMIN }
    }),
    prisma.user.upsert({
      where: { email: "rafael.mendes@buriti.ma.gov.br" },
      update: { passwordHash, isActive: true },
      create: { name: "Rafael Mendes", email: "rafael.mendes@buriti.ma.gov.br", passwordHash, role: UserRole.ANALISTA, phone: "(98) 98421-1234" }
    }),
    prisma.user.upsert({
      where: { email: "juliana.pereira@buriti.ma.gov.br" },
      update: { passwordHash, isActive: true },
      create: { name: "Juliana Pereira", email: "juliana.pereira@buriti.ma.gov.br", passwordHash, role: UserRole.FISCAL }
    }),
    prisma.user.upsert({
      where: { email: "empreendedor@empresa.com" },
      update: { passwordHash, isActive: true },
      create: { name: "Marcos Vinicius Sousa", email: "empreendedor@empresa.com", passwordHash, role: UserRole.EMPREENDEDOR, phone: "(98) 98421-1234" }
    })
  ]);

  const activity = await prisma.activity.upsert({
    where: { code: "41.20-4" },
    update: {},
    create: {
      code: "41.20-4",
      description: "Construcao de edificios e loteamentos urbanos",
      size: "Medio",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.LI, LicenseType.LO],
      requiredDocuments: ["Requerimento", "CNPJ ou CPF", "Contrato social", "Projeto ambiental", "ART", "Planta e memorial descritivo"]
    }
  });

  const ruralActivity = await prisma.activity.upsert({
    where: { code: "01.11-3" },
    update: {},
    create: {
      code: "01.11-3",
      description: "Atividades agrossilvipastoris e regularizacao rural",
      size: "Grande",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.LUA, LicenseType.LUAR, LicenseType.RELUA, LicenseType.AQC],
      requiredDocuments: ["Requerimento", "CPF ou CNPJ", "CAR", "ART", "Projeto ambiental", "Documento de posse", "Memorial descritivo"]
    }
  });

  await Promise.all([
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.LUA },
      update: {},
      create: {
        licenseType: LicenseType.LUA,
        displayName: "Licenca Unica Ambiental",
        deadlineDays: 30,
        validityDays: 1460,
        requiresInspection: true,
        requiredDocuments: ["CAR", "Projeto ambiental", "Memorial descritivo"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.LUAR },
      update: {},
      create: {
        licenseType: LicenseType.LUAR,
        displayName: "Licenca Unica Ambiental de Regularizacao",
        deadlineDays: 45,
        validityDays: 1460,
        requiresInspection: true,
        requiredDocuments: ["CAR", "PRADA", "Termo de compromisso ambiental"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.RELUA },
      update: {},
      create: {
        licenseType: LicenseType.RELUA,
        displayName: "Renovacao da Licenca Unica Ambiental",
        deadlineDays: 30,
        validityDays: 1460,
        requiresInspection: false,
        requiredDocuments: ["Licenca anterior", "Relatorio de cumprimento de condicionantes"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.AQC },
      update: {},
      create: {
        licenseType: LicenseType.AQC,
        displayName: "Autorizacao de Queima Controlada",
        deadlineDays: 20,
        validityDays: 180,
        requiresInspection: true,
        requiredDocuments: ["Croqui da area", "Autorizacao do proprietario", "Plano de controle"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.LI },
      update: {},
      create: {
        licenseType: LicenseType.LI,
        displayName: "Licenca de Instalacao",
        deadlineDays: 30,
        validityDays: 1095,
        requiresInspection: false,
        requiredDocuments: ["Projeto ambiental", "ART"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.LO },
      update: {},
      create: {
        licenseType: LicenseType.LO,
        displayName: "Licenca de Operacao",
        deadlineDays: 30,
        validityDays: 1460,
        requiresInspection: true,
        requiredDocuments: ["Relatorio de implantacao", "Comprovante de condicionantes"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    }),
    prisma.licenseRule.upsert({
      where: { licenseType: LicenseType.LOC },
      update: {},
      create: {
        licenseType: LicenseType.LOC,
        displayName: "Licenca de Operacao Corretiva",
        deadlineDays: 45,
        validityDays: 1095,
        requiresInspection: true,
        requiredDocuments: ["Relatorio ambiental", "Plano de controle corretivo"],
        legalBasis: "Lei Municipal 756/2024, art. 2"
      }
    })
  ]);

  const entrepreneur = await prisma.entrepreneur.upsert({
    where: { userId: empreendedorUser.id },
    update: {},
    create: {
      userId: empreendedorUser.id,
      personType: "PJ",
      name: "Construtora Sao Bento LTDA",
      companyName: "Construtora Sao Bento LTDA",
      tradeName: "Sao Bento Engenharia",
      cnpj: "12.345.678/0001-90",
      legalRepresentative: "Marcos Vinicius Sousa",
      address: "Avenida Central, 1200, Buriti - MA",
      phone: "(98) 98888-1000",
      email: "contato@saobento.com.br"
    }
  });

  const enterprise = await prisma.enterprise.findFirst({
    where: { entrepreneurId: entrepreneur.id, name: "Loteamento Jardim das Aguas" }
  }) ?? await prisma.enterprise.create({
    data: {
      entrepreneurId: entrepreneur.id,
      name: "Loteamento Jardim das Aguas",
      address: "MA-034, km 4, zona urbana",
      latitude: -3.9412,
      longitude: -42.9231,
      activityId: activity.id,
      areaHectares: 18.5,
      size: "Medio",
      pollutionLevel: "Medio",
      propertyClass: "Urbano"
    }
  });

  const licensingProcess = await prisma.process.upsert({
    where: { number: "2025.000124" },
    update: {
      entrepreneurId: entrepreneur.id,
      enterpriseId: enterprise.id,
      analystId: analista.id
    },
    create: {
      number: "2025.000124",
      protocol: "BURITI-2025-000124",
      entrepreneurId: entrepreneur.id,
      enterpriseId: enterprise.id,
      analystId: analista.id,
      licenseType: LicenseType.LI,
      status: ProcessStatus.AGUARDANDO_DOCUMENTOS,
      openedAt: new Date("2025-05-16T09:14:00.000Z"),
      dueDate: new Date("2025-06-10T23:59:59.000Z"),
      publicSummary: "Processo de licenca de instalacao para loteamento urbano.",
      documents: {
        create: [
          { name: "Requerimento", status: "VALIDADO", fileName: "requerimento.pdf" },
          { name: "CNPJ", status: "VALIDADO", fileName: "cnpj.pdf" },
          { name: "ART", status: "PENDENTE" },
          { name: "Projeto ambiental", status: "PENDENTE" },
          { name: "Planta e memorial descritivo", status: "PENDENTE" }
        ]
      },
      history: {
        create: [
          { status: ProcessStatus.RECEBIDO, description: "Processo recebido e protocolo gerado automaticamente.", actorName: "Sistema" },
          { status: ProcessStatus.EM_ANALISE, description: "Dados basicos conferidos.", actorName: admin.name },
          { status: ProcessStatus.AGUARDANDO_DOCUMENTOS, description: "Complementacao documental solicitada ao empreendedor.", actorName: analista.name }
        ]
      },
      messages: {
        create: [
          { senderName: analista.name, content: "Favor anexar ART e projeto ambiental atualizado." }
        ]
      }
    }
  });

  await prisma.fee.createMany({
    data: [
      { activityId: activity.id, licenseType: LicenseType.LI, size: "Medio", amountCents: 145000 },
      { activityId: activity.id, licenseType: LicenseType.LO, size: "Medio", amountCents: 168000 },
      { activityId: ruralActivity.id, licenseType: LicenseType.LUA, size: "Grande", amountCents: 390000 },
      { activityId: ruralActivity.id, licenseType: LicenseType.RELUA, size: "Grande", amountCents: 240000 }
    ],
    skipDuplicates: true
  });

  await prisma.inspection.create({
    data: {
      processId: licensingProcess.id,
      fiscalId: fiscal.id,
      type: "VISTORIA",
      scheduledAt: new Date("2025-06-05T13:00:00.000Z"),
      latitude: -3.9412,
      longitude: -42.9231,
      report: "Vistoria inicial agendada para verificacao da area diretamente afetada.",
      photos: []
    }
  });

  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      agency: "Secretaria Municipal de Meio Ambiente e Turismo",
      municipality: "Buriti - MA",
      analysisDeadlineDays: 30,
      expirationAlertDays: 45,
      maxUploadMb: 10,
      publicSearchEnabled: true
    }
  });

  await prisma.documentTemplate.createMany({
    data: [
      {
        name: "Licenca Ambiental Municipal",
        type: "Licenca",
        content: "Concede-se a licenca ambiental ao empreendimento {{empreendimento}}, processo {{processo}}, observadas as condicionantes anexas."
      },
      {
        name: "Parecer Tecnico",
        type: "Parecer",
        content: "Apos analise dos documentos apresentados, conclui-se pelo {{resultado}} do pedido, conforme fundamentos tecnicos registrados."
      },
      {
        name: "Notificacao de Complementacao",
        type: "Notificacao",
        content: "Notifica-se o empreendedor para apresentar a documentacao complementar indicada no prazo regulamentar."
      }
    ],
    skipDuplicates: true
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    logger.error({ action: "SEED_FAILED", error: error instanceof Error ? error.message : "Falha ao executar seed." }, "seed_failed");
    await prisma.$disconnect();
    process.exit(1);
  });
