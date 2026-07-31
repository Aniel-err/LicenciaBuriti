import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  DocumentStatus,
  InstitutionalContentType,
  InspectionType,
  LicenseType,
  PersonType,
  PrismaClient,
  ProcessStatus,
  UserRole
} from "@prisma/client";
import { logger } from "../src/security/logger.js";

const prisma = new PrismaClient();

const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
const plusDays = (value: Date, days: number) => new Date(value.getTime() + days * 86_400_000);
const fileName = (name: string) => `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

type DemoProcess = {
  number: string;
  enterpriseKey: string;
  analystKey?: "rafael" | "camila";
  licenseType: LicenseType;
  status: ProcessStatus;
  openedAt: Date;
  dueDate: Date;
  decidedAt?: Date;
  summary: string;
  documents: string[];
  pendingDocuments?: string[];
  rejectedDocuments?: string[];
  messages?: Array<{ sender: string; content: string; createdAt: Date }>;
  inspection?: {
    fiscalKey: "juliana" | "paulo";
    type: InspectionType;
    scheduledAt: Date;
    report: string;
    status: "AGENDADA" | "VALIDADA";
    validationNotes?: string;
  };
  opinion?: { conclusion: string; content: string; createdAt: Date };
  conditions?: Array<{ description: string; dueDate: Date; status: "PENDENTE" | "CUMPRIDA" }>;
  issuedDocument?: {
    type: string;
    number: string;
    validationCode: string;
    signedBy: string;
    issuedAt: Date;
    validUntil: Date;
  };
};

async function main() {
  const demoPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!demoPassword) {
    throw new Error("Defina SEED_ADMIN_PASSWORD em apps/api/.env antes de carregar a demonstracao.");
  }
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const userSeeds = {
    admin: { name: "Aline Carvalho", email: "admin@buriti.ma.gov.br", role: UserRole.ADMIN, phone: "(98) 98400-1001" },
    rafael: { name: "Rafael Mendes", email: "rafael.mendes@buriti.ma.gov.br", role: UserRole.ANALISTA, phone: "(98) 98421-1234" },
    camila: { name: "Camila Nascimento", email: "camila.nascimento@buriti.ma.gov.br", role: UserRole.ANALISTA, phone: "(98) 98400-1002" },
    juliana: { name: "Juliana Pereira", email: "juliana.pereira@buriti.ma.gov.br", role: UserRole.FISCAL, phone: "(98) 98400-1003" },
    paulo: { name: "Paulo Henrique Costa", email: "paulo.costa@buriti.ma.gov.br", role: UserRole.FISCAL, phone: "(98) 98400-1004" },
    marcos: { name: "Marcos Vinicius Sousa", email: "empreendedor@empresa.com", role: UserRole.EMPREENDEDOR, phone: "(98) 98888-1000" },
    helena: { name: "Helena Ribeiro", email: "helena.ribeiro@demo.example", role: UserRole.EMPREENDEDOR, phone: "(98) 98888-2100" },
    joao: { name: "Joao Batista Lima", email: "joao.lima@demo.example", role: UserRole.EMPREENDEDOR, phone: "(98) 98888-3100" }
  } as const;

  const users = {} as Record<keyof typeof userSeeds, Awaited<ReturnType<typeof prisma.user.upsert>>>;
  for (const [key, seed] of Object.entries(userSeeds) as Array<[keyof typeof userSeeds, (typeof userSeeds)[keyof typeof userSeeds]]>) {
    users[key] = await prisma.user.upsert({
      where: { email: seed.email },
      update: { name: seed.name, role: seed.role, phone: seed.phone, passwordHash, isActive: true },
      create: { ...seed, passwordHash, isActive: true }
    });
  }

  const activitySeeds = {
    construction: {
      code: "41.20-4",
      description: "Construção de edifícios e loteamentos urbanos",
      size: "Medio",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.LP, LicenseType.LI, LicenseType.LO],
      requiredDocuments: ["Requerimento", "CNPJ ou CPF", "Contrato social", "Projeto ambiental", "ART", "Planta e memorial descritivo"]
    },
    rural: {
      code: "01.11-3",
      description: "Atividades agrossilvipastoris e regularização rural",
      size: "Grande",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.LUA, LicenseType.LUAR, LicenseType.RELUA, LicenseType.AQC],
      requiredDocuments: ["Requerimento", "CPF ou CNPJ", "CAR", "ART", "Projeto ambiental", "Documento de posse", "Memorial descritivo"]
    },
    fuel: {
      code: "47.30-1",
      description: "Comércio varejista de combustíveis e serviços automotivos",
      size: "Medio",
      pollutionLevel: "Alto",
      requiredLicenses: [LicenseType.LP, LicenseType.LI, LicenseType.LO, LicenseType.LOC],
      requiredDocuments: ["Requerimento", "CNPJ", "Projeto do sistema de tanques", "PGRS", "Laudo de estanqueidade", "ART"]
    },
    food: {
      code: "10.91-1",
      description: "Beneficiamento e processamento de produtos alimentícios",
      size: "Medio",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.LO, LicenseType.RENOVACAO],
      requiredDocuments: ["Requerimento", "CNPJ", "Projeto sanitario", "PGRS", "Outorga de uso da agua", "ART"]
    },
    recycling: {
      code: "38.11-4",
      description: "Coleta, triagem e armazenamento de resíduos não perigosos",
      size: "Pequeno",
      pollutionLevel: "Medio",
      requiredLicenses: [LicenseType.AUTORIZACAO, LicenseType.DISPENSA, LicenseType.LO],
      requiredDocuments: ["Requerimento", "CNPJ", "Plano de gerenciamento de residuos", "Croqui de localizacao", "ART"]
    },
    ceramic: {
      code: "23.42-7",
      description: "Fabricação de produtos cerâmicos para construção",
      size: "Medio",
      pollutionLevel: "Alto",
      requiredLicenses: [LicenseType.LP, LicenseType.LI, LicenseType.LO],
      requiredDocuments: ["Requerimento", "CNPJ", "Estudo ambiental", "Plano de controle de emissoes", "ART"]
    }
  } as const;

  const activities = {} as Record<keyof typeof activitySeeds, Awaited<ReturnType<typeof prisma.activity.upsert>>>;
  for (const [key, seed] of Object.entries(activitySeeds) as Array<[keyof typeof activitySeeds, (typeof activitySeeds)[keyof typeof activitySeeds]]>) {
    activities[key] = await prisma.activity.upsert({
      where: { code: seed.code },
      update: seed,
      create: seed
    });
  }

  const entrepreneurSeeds = {
    construction: {
      userId: users.marcos.id,
      personType: PersonType.PJ,
      name: "Construtora Sao Bento LTDA",
      companyName: "Construtora Sao Bento LTDA",
      tradeName: "Sao Bento Engenharia",
      cnpj: "12.345.678/0001-90",
      legalRepresentative: "Marcos Vinicius Sousa",
      address: "Avenida Central, 1200, Centro, Buriti - MA",
      phone: "(98) 98888-1000",
      email: "contato@saobento.demo.example"
    },
    rural: {
      userId: users.helena.id,
      personType: PersonType.PF,
      name: "Helena Ribeiro",
      cpf: "000.111.222-33",
      rg: "0000000 SSP/MA",
      legalRepresentative: "Helena Ribeiro",
      address: "Povoado Santa Luzia, zona rural, Buriti - MA",
      phone: "(98) 98888-2100",
      email: "helena.ribeiro@demo.example"
    },
    fuel: {
      userId: users.joao.id,
      personType: PersonType.PJ,
      name: "Posto Buriti Verde LTDA",
      companyName: "Posto Buriti Verde LTDA",
      tradeName: "Posto Buriti Verde",
      cnpj: "23.456.789/0001-01",
      legalRepresentative: "Joao Batista Lima",
      address: "Avenida Governador Nunes Freire, 480, Buriti - MA",
      phone: "(98) 98888-3100",
      email: "contato@postoburitiverde.demo.example"
    },
    food: {
      personType: PersonType.PJ,
      name: "Alimentos Serra Dourada LTDA",
      companyName: "Alimentos Serra Dourada LTDA",
      tradeName: "Serra Dourada Alimentos",
      cnpj: "34.567.890/0001-12",
      legalRepresentative: "Luciana Alves Rocha",
      address: "Rua do Comercio, 245, Buriti - MA",
      phone: "(98) 98888-4100",
      email: "ambiental@serradourada.demo.example"
    },
    recycling: {
      personType: PersonType.PJ,
      name: "Cooperativa Recicla Buriti",
      companyName: "Cooperativa de Catadores Recicla Buriti",
      tradeName: "Recicla Buriti",
      cnpj: "45.678.901/0001-23",
      legalRepresentative: "Francisca das Chagas Silva",
      address: "Travessa da Esperanca, 80, Buriti - MA",
      phone: "(98) 98888-5100",
      email: "gestao@reciclaburiti.demo.example"
    },
    ceramic: {
      personType: PersonType.PJ,
      name: "Ceramica Novo Horizonte LTDA",
      companyName: "Ceramica Novo Horizonte LTDA",
      tradeName: "Ceramica Novo Horizonte",
      cnpj: "56.789.012/0001-34",
      legalRepresentative: "Antonio Carlos Ferreira",
      address: "Estrada do Povoado Areia Branca, km 3, Buriti - MA",
      phone: "(98) 98888-6100",
      email: "contato@ceramicanovohorizonte.demo.example"
    }
  } as const;

  const entrepreneurs = {} as Record<keyof typeof entrepreneurSeeds, Awaited<ReturnType<typeof prisma.entrepreneur.create>>>;
  for (const [key, seed] of Object.entries(entrepreneurSeeds) as Array<[keyof typeof entrepreneurSeeds, (typeof entrepreneurSeeds)[keyof typeof entrepreneurSeeds]]>) {
    const existing = "userId" in seed && seed.userId
      ? await prisma.entrepreneur.findUnique({ where: { userId: seed.userId } })
      : await prisma.entrepreneur.findFirst({ where: { cnpj: "cnpj" in seed ? seed.cnpj : undefined } });
    entrepreneurs[key] = existing
      ? await prisma.entrepreneur.update({ where: { id: existing.id }, data: seed })
      : await prisma.entrepreneur.create({ data: seed });
  }

  const technicalManagers = [
    { entrepreneurKey: "construction", name: "Eng. Marina Lopes", cpf: "000.222.333-44", professionalId: "CREA-MA 000001", phone: "(98) 98700-1001", email: "marina.lopes@demo.example", artDocument: "ART-2026-0101" },
    { entrepreneurKey: "rural", name: "Eng. Agr. Daniel Araujo", cpf: "000.333.444-55", professionalId: "CREA-MA 000002", phone: "(98) 98700-1002", email: "daniel.araujo@demo.example", artDocument: "ART-2026-0102" },
    { entrepreneurKey: "fuel", name: "Eng. Ambiental Beatriz Lima", cpf: "000.444.555-66", professionalId: "CREA-MA 000003", phone: "(98) 98700-1003", email: "beatriz.lima@demo.example", artDocument: "ART-2026-0103" },
    { entrepreneurKey: "food", name: "Tec. Ambiental Carlos Moura", cpf: "000.555.666-77", professionalId: "CRT-MA 000004", phone: "(98) 98700-1004", email: "carlos.moura@demo.example", artDocument: "TRT-2026-0104" }
  ] as const;

  for (const manager of technicalManagers) {
    const entrepreneurId = entrepreneurs[manager.entrepreneurKey].id;
    const existing = await prisma.technicalManager.findFirst({ where: { entrepreneurId, professionalId: manager.professionalId } });
    const data = { entrepreneurId, name: manager.name, cpf: manager.cpf, council: manager.professionalId.split(" ")[0]?.split("-")[0], professionalId: manager.professionalId, phone: manager.phone, email: manager.email, artDocument: manager.artDocument };
    if (existing) await prisma.technicalManager.update({ where: { id: existing.id }, data });
    else await prisma.technicalManager.create({ data });
  }

  const enterpriseSeeds = {
    construction: { entrepreneurKey: "construction", activityKey: "construction", name: "Loteamento Jardim das Aguas", address: "MA-034, km 4, zona urbana", district: "Bairro Bacuri", zone: "URBANA", latitude: -3.9412, longitude: -42.9231, areaHectares: 18.5, size: "Medio", pollutionLevel: "Medio", propertyClass: "Urbano" },
    rural: { entrepreneurKey: "rural", activityKey: "rural", name: "Fazenda Boa Esperanca", address: "Povoado Santa Luzia, zona rural", district: "Povoado Santa Luzia", zone: "RURAL", latitude: -3.8754, longitude: -42.8862, areaHectares: 286.4, fiscalModules: 3.2, size: "Grande", pollutionLevel: "Medio", propertyClass: "Rural" },
    fuel: { entrepreneurKey: "fuel", activityKey: "fuel", name: "Posto Buriti Verde - Centro", address: "Avenida Governador Nunes Freire, 480", district: "Centro", zone: "URBANA", latitude: -3.9428, longitude: -42.9172, areaHectares: 0.62, size: "Medio", pollutionLevel: "Alto", propertyClass: "Urbano" },
    food: { entrepreneurKey: "food", activityKey: "food", name: "Unidade de Beneficiamento Serra Dourada", address: "Distrito Industrial, lote 12", district: "Distrito Industrial", zone: "URBANA", latitude: -3.9561, longitude: -42.9048, areaHectares: 2.8, size: "Medio", pollutionLevel: "Medio", propertyClass: "Urbano" },
    recycling: { entrepreneurKey: "recycling", activityKey: "recycling", name: "Central de Triagem Recicla Buriti", address: "Estrada Vicinal do Angelim, km 2", district: "Angelim", zone: "URBANA", latitude: -3.9284, longitude: -42.9472, areaHectares: 1.4, size: "Pequeno", pollutionLevel: "Medio", propertyClass: "Urbano" },
    ceramic: { entrepreneurKey: "ceramic", activityKey: "ceramic", name: "Ceramica Novo Horizonte", address: "Estrada do Povoado Areia Branca, km 3", district: "Povoado Areia Branca", zone: "RURAL", latitude: -3.9015, longitude: -42.9621, areaHectares: 7.9, size: "Medio", pollutionLevel: "Alto", propertyClass: "Rural" }
  } as const;

  const enterprises = {} as Record<keyof typeof enterpriseSeeds, Awaited<ReturnType<typeof prisma.enterprise.create>>>;
  for (const [key, seed] of Object.entries(enterpriseSeeds) as Array<[keyof typeof enterpriseSeeds, (typeof enterpriseSeeds)[keyof typeof enterpriseSeeds]]>) {
    const entrepreneurId = entrepreneurs[seed.entrepreneurKey].id;
    const activityId = activities[seed.activityKey].id;
    const existing = await prisma.enterprise.findFirst({ where: { entrepreneurId, name: seed.name } });
    const data = {
      entrepreneurId,
      activityId,
      name: seed.name,
      address: seed.address,
      municipality: "Buriti - MA",
      district: seed.district,
      zone: seed.zone,
      latitude: seed.latitude,
      longitude: seed.longitude,
      areaHectares: seed.areaHectares,
      fiscalModules: "fiscalModules" in seed ? seed.fiscalModules : undefined,
      size: seed.size,
      pollutionLevel: seed.pollutionLevel,
      propertyClass: seed.propertyClass
    };
    enterprises[key] = existing
      ? await prisma.enterprise.update({ where: { id: existing.id }, data })
      : await prisma.enterprise.create({ data });
  }

  for (const manager of technicalManagers) {
    const enterprise = enterprises[manager.entrepreneurKey];
    await prisma.technicalManager.updateMany({
      where: { entrepreneurId: enterprise.entrepreneurId, professionalId: manager.professionalId },
      data: { enterpriseId: enterprise.id }
    });
  }

  const processes: DemoProcess[] = [
    {
      number: "2026.000101", enterpriseKey: "construction", analystKey: "rafael", licenseType: LicenseType.LI,
      status: ProcessStatus.AGUARDANDO_DOCUMENTOS, openedAt: date("2026-07-15"), dueDate: date("2026-08-14"),
      summary: "Licenca de instalacao para loteamento residencial com infraestrutura de drenagem e saneamento.",
      documents: ["Requerimento", "CNPJ", "Contrato social", "Projeto ambiental", "ART", "Planta e memorial descritivo"],
      pendingDocuments: ["Projeto ambiental"], rejectedDocuments: ["Planta e memorial descritivo"],
      messages: [
        { sender: "Rafael Mendes", content: "Solicitamos a versao revisada do projeto ambiental e do memorial descritivo.", createdAt: date("2026-07-22") },
        { sender: "Marcos Vinicius Sousa", content: "A equipe tecnica esta concluindo os ajustes e enviara os documentos ate sexta-feira.", createdAt: date("2026-07-24") }
      ],
      inspection: { fiscalKey: "juliana", type: InspectionType.VISTORIA, scheduledAt: date("2026-08-04"), report: "Vistoria previa para conferencia da area de implantacao e drenagem projetada.", status: "AGENDADA" }
    },
    {
      number: "2026.000102", enterpriseKey: "rural", analystKey: "camila", licenseType: LicenseType.LUA,
      status: ProcessStatus.EM_ANALISE, openedAt: date("2026-07-18"), dueDate: date("2026-08-17"),
      summary: "Regularizacao ambiental de atividade agrossilvipastoril em propriedade rural.",
      documents: ["Requerimento", "CPF", "CAR", "ART", "Projeto ambiental", "Documento de posse", "Memorial descritivo"],
      messages: [{ sender: "Camila Nascimento", content: "Documentacao recebida. O processo segue para analise tecnica e vistoria.", createdAt: date("2026-07-23") }],
      inspection: { fiscalKey: "paulo", type: InspectionType.VISTORIA, scheduledAt: date("2026-08-06"), report: "Conferir areas de preservacao permanente, reserva legal e estruturas produtivas.", status: "AGENDADA" },
      opinion: { conclusion: "Analise preliminar favoravel", content: "Os documentos apresentados atendem aos requisitos iniciais. A conclusao depende da vistoria de campo.", createdAt: date("2026-07-28") }
    },
    {
      number: "2026.000103", enterpriseKey: "fuel", licenseType: LicenseType.LO,
      status: ProcessStatus.RECEBIDO, openedAt: date("2026-07-29"), dueDate: date("2026-08-28"),
      summary: "Pedido de licenca de operacao para comercio varejista de combustiveis.",
      documents: ["Requerimento", "CNPJ", "Projeto do sistema de tanques", "PGRS", "Laudo de estanqueidade", "ART"],
      pendingDocuments: ["Laudo de estanqueidade", "ART"],
      messages: [{ sender: "Sistema", content: "Protocolo gerado. O processo aguarda distribuicao para analista.", createdAt: date("2026-07-29") }]
    },
    {
      number: "2026.000104", enterpriseKey: "food", analystKey: "rafael", licenseType: LicenseType.LO,
      status: ProcessStatus.DEFERIDO, openedAt: date("2026-06-10"), dueDate: date("2026-07-10"), decidedAt: date("2026-07-08"),
      summary: "Licenciamento da unidade de beneficiamento de produtos alimenticios.",
      documents: ["Requerimento", "CNPJ", "Projeto sanitario", "PGRS", "Outorga de uso da agua", "ART"],
      opinion: { conclusion: "Deferimento", content: "A unidade implantou controles de efluentes, residuos e higiene compativeis com a atividade.", createdAt: date("2026-07-06") },
      inspection: { fiscalKey: "juliana", type: InspectionType.VISTORIA, scheduledAt: date("2026-06-25"), report: "Estruturas, sistema de efluentes e area de armazenamento verificados em campo.", status: "VALIDADA", validationNotes: "Instalacoes em conformidade com o projeto apresentado." },
      conditions: [
        { description: "Manter atualizado o Plano de Gerenciamento de Residuos Solidos.", dueDate: date("2027-07-08"), status: "PENDENTE" },
        { description: "Apresentar relatorio anual de monitoramento de efluentes.", dueDate: date("2027-01-31"), status: "PENDENTE" }
      ],
      issuedDocument: { type: "Licença de Operação", number: "LO-2026-000104", validationCode: "BURITI-DEMO-LO-2026-104", signedBy: "Secretaria Municipal de Meio Ambiente e Turismo", issuedAt: date("2026-07-08"), validUntil: date("2030-07-08") }
    },
    {
      number: "2026.000105", enterpriseKey: "rural", analystKey: "camila", licenseType: LicenseType.AQC,
      status: ProcessStatus.INDEFERIDO, openedAt: date("2026-06-20"), dueDate: date("2026-07-10"), decidedAt: date("2026-07-18"),
      summary: "Pedido de autorizacao de queima controlada em area produtiva.",
      documents: ["Requerimento", "Croqui da area", "Autorizacao do proprietario", "Plano de controle"],
      rejectedDocuments: ["Plano de controle"],
      opinion: { conclusion: "Indeferimento", content: "O plano apresentado nao demonstrou medidas suficientes de prevencao, aceiros e resposta a emergencia.", createdAt: date("2026-07-17") },
      messages: [{ sender: "Camila Nascimento", content: "O indeferimento foi fundamentado no parecer tecnico. E possivel apresentar novo pedido com plano revisado.", createdAt: date("2026-07-18") }]
    },
    {
      number: "2026.000106", enterpriseKey: "recycling", analystKey: "rafael", licenseType: LicenseType.AUTORIZACAO,
      status: ProcessStatus.ARQUIVADO, openedAt: date("2026-05-05"), dueDate: date("2026-06-04"), decidedAt: date("2026-06-20"),
      summary: "Autorizacao temporaria para armazenamento de residuos reciclaveis.",
      documents: ["Requerimento", "CNPJ", "Plano de gerenciamento de residuos", "Croqui de localizacao", "ART"],
      pendingDocuments: ["ART"],
      messages: [{ sender: "Sistema", content: "Processo arquivado apos encerramento do prazo para complementacao documental.", createdAt: date("2026-06-20") }]
    },
    {
      number: "2026.000107", enterpriseKey: "construction", analystKey: "rafael", licenseType: LicenseType.LO,
      status: ProcessStatus.DEFERIDO, openedAt: date("2026-04-12"), dueDate: date("2026-05-12"), decidedAt: date("2026-05-09"),
      summary: "Licenca de operacao da primeira etapa do Loteamento Jardim das Aguas.",
      documents: ["Requerimento", "CNPJ", "Relatorio de implantacao", "Comprovante de condicionantes", "ART"],
      opinion: { conclusion: "Deferimento", content: "As obras de drenagem, vias e areas verdes foram executadas conforme o projeto aprovado.", createdAt: date("2026-05-07") },
      inspection: { fiscalKey: "juliana", type: InspectionType.VISTORIA, scheduledAt: date("2026-04-28"), report: "Vistoria de verificacao das obras de infraestrutura e das medidas de controle ambiental.", status: "VALIDADA", validationNotes: "Medidas implantadas satisfatoriamente." },
      conditions: [
        { description: "Manter desobstruidos os dispositivos de drenagem pluvial.", dueDate: date("2027-05-09"), status: "PENDENTE" },
        { description: "Executar o plano de arborizacao das areas verdes.", dueDate: date("2026-12-20"), status: "PENDENTE" }
      ],
      issuedDocument: { type: "Licença de Operação", number: "LO-2026-000107", validationCode: "BURITI-DEMO-LO-2026-107", signedBy: "Secretaria Municipal de Meio Ambiente e Turismo", issuedAt: date("2026-05-09"), validUntil: date("2030-05-09") }
    },
    {
      number: "2026.000108", enterpriseKey: "ceramic", analystKey: "camila", licenseType: LicenseType.LP,
      status: ProcessStatus.EM_ANALISE, openedAt: date("2026-07-08"), dueDate: date("2026-08-07"),
      summary: "Licenca previa para ampliacao de unidade de fabricacao de produtos ceramicos.",
      documents: ["Requerimento", "CNPJ", "Estudo ambiental", "Plano de controle de emissoes", "ART"],
      messages: [{ sender: "Camila Nascimento", content: "O estudo ambiental esta em avaliacao pela equipe tecnica.", createdAt: date("2026-07-16") }],
      inspection: { fiscalKey: "paulo", type: InspectionType.VISTORIA, scheduledAt: date("2026-07-24"), report: "Avaliacao de area proposta para ampliacao, fontes de emissao e vizinhanca.", status: "VALIDADA", validationNotes: "Area compativel, condicionada a melhorias no controle de particulados." },
      opinion: { conclusion: "Favoravel com condicionantes", content: "A localizacao e viavel, desde que o projeto executivo incorpore sistema de controle de material particulado.", createdAt: date("2026-07-29") }
    },
    {
      number: "2026.000109", enterpriseKey: "recycling", licenseType: LicenseType.DISPENSA,
      status: ProcessStatus.RECEBIDO, openedAt: date("2026-07-30"), dueDate: date("2026-08-19"),
      summary: "Solicitacao de declaracao de dispensa para ponto de recebimento de reciclaveis.",
      documents: ["Requerimento", "CNPJ", "Croqui de localizacao", "Declaracao da atividade"],
      pendingDocuments: ["Declaracao da atividade"]
    },
    {
      number: "2026.000110", enterpriseKey: "rural", analystKey: "camila", licenseType: LicenseType.LUAR,
      status: ProcessStatus.AGUARDANDO_DOCUMENTOS, openedAt: date("2026-07-02"), dueDate: date("2026-08-16"),
      summary: "Regularizacao de passivos ambientais e adequacao de atividade rural.",
      documents: ["Requerimento", "CAR", "PRADA", "Termo de compromisso ambiental", "Documento de posse"],
      pendingDocuments: ["Termo de compromisso ambiental"], rejectedDocuments: ["PRADA"],
      messages: [{ sender: "Camila Nascimento", content: "Apresente o PRADA revisado com cronograma fisico e areas georreferenciadas.", createdAt: date("2026-07-21") }]
    },
    {
      number: "2026.000111", enterpriseKey: "fuel", analystKey: "rafael", licenseType: LicenseType.LOC,
      status: ProcessStatus.EM_ANALISE, openedAt: date("2026-06-28"), dueDate: date("2026-08-12"),
      summary: "Regularizacao corretiva das instalacoes do posto de combustiveis.",
      documents: ["Requerimento", "CNPJ", "Relatorio ambiental", "Plano de controle corretivo", "Laudo de estanqueidade", "ART"],
      messages: [{ sender: "Rafael Mendes", content: "Laudo de estanqueidade validado. Aguardamos a vistoria conclusiva.", createdAt: date("2026-07-26") }],
      inspection: { fiscalKey: "juliana", type: InspectionType.VISTORIA, scheduledAt: date("2026-08-03"), report: "Verificar sistema separador de agua e oleo, tanques, canaletas e area de abastecimento.", status: "AGENDADA" }
    },
    {
      number: "2026.000112", enterpriseKey: "food", analystKey: "camila", licenseType: LicenseType.RENOVACAO,
      status: ProcessStatus.DEFERIDO, openedAt: date("2026-05-20"), dueDate: date("2026-06-19"), decidedAt: date("2026-06-17"),
      summary: "Renovacao da licenca ambiental da unidade de beneficiamento.",
      documents: ["Requerimento", "Licenca anterior", "Relatorio de cumprimento de condicionantes", "PGRS atualizado", "ART"],
      opinion: { conclusion: "Renovacao deferida", content: "As condicionantes da licenca anterior foram cumpridas e os controles permanecem operacionais.", createdAt: date("2026-06-15") },
      conditions: [{ description: "Realizar treinamento ambiental anual com os colaboradores.", dueDate: date("2027-06-17"), status: "PENDENTE" }],
      issuedDocument: { type: "Renovação de Licença Ambiental", number: "REN-2026-000112", validationCode: "BURITI-DEMO-REN-2026-112", signedBy: "Secretaria Municipal de Meio Ambiente e Turismo", issuedAt: date("2026-06-17"), validUntil: date("2030-06-17") }
    }
  ];

  const processRecords: Array<{ id: string; number: string }> = [];
  for (const seed of processes) {
    const enterprise = enterprises[seed.enterpriseKey as keyof typeof enterprises];
    const analyst = seed.analystKey ? users[seed.analystKey] : null;
    const process = await prisma.process.upsert({
      where: { number: seed.number },
      update: {
        protocol: `BURITI-${seed.number}`,
        entrepreneurId: enterprise.entrepreneurId,
        enterpriseId: enterprise.id,
        analystId: analyst?.id ?? null,
        licenseType: seed.licenseType,
        status: seed.status,
        openedAt: seed.openedAt,
        dueDate: seed.dueDate,
        decidedAt: seed.decidedAt ?? null,
        publicSummary: seed.summary
      },
      create: {
        number: seed.number,
        protocol: `BURITI-${seed.number}`,
        entrepreneurId: enterprise.entrepreneurId,
        enterpriseId: enterprise.id,
        analystId: analyst?.id,
        licenseType: seed.licenseType,
        status: seed.status,
        openedAt: seed.openedAt,
        dueDate: seed.dueDate,
        decidedAt: seed.decidedAt,
        publicSummary: seed.summary
      }
    });

    await prisma.$transaction([
      prisma.document.deleteMany({ where: { processId: process.id } }),
      prisma.issuedDocument.deleteMany({ where: { processId: process.id } }),
      prisma.opinion.deleteMany({ where: { processId: process.id } }),
      prisma.condition.deleteMany({ where: { processId: process.id } }),
      prisma.inspection.deleteMany({ where: { processId: process.id } }),
      prisma.message.deleteMany({ where: { processId: process.id } }),
      prisma.processHistory.deleteMany({ where: { processId: process.id } })
    ]);

    const pending = new Set(seed.pendingDocuments ?? []);
    const rejected = new Set(seed.rejectedDocuments ?? []);
    await prisma.document.createMany({
      data: seed.documents.map((name, index) => {
        const status = pending.has(name) ? DocumentStatus.PENDENTE : rejected.has(name) ? DocumentStatus.RECUSADO : seed.status === ProcessStatus.RECEBIDO ? DocumentStatus.ENVIADO : DocumentStatus.VALIDADO;
        return {
          processId: process.id,
          name,
          fileName: status === DocumentStatus.PENDENTE ? null : fileName(name),
          status,
          notes: status === DocumentStatus.RECUSADO ? "Documento precisa ser revisado conforme orientacao da analise tecnica." : null,
          uploadedAt: status === DocumentStatus.PENDENTE ? null : plusDays(seed.openedAt, Math.min(index + 1, 5)),
          version: status === DocumentStatus.PENDENTE ? 0 : 1
        };
      })
    });

    const histories = [
      {
        processId: process.id,
        status: ProcessStatus.RECEBIDO,
        description: "Processo recebido e protocolo gerado automaticamente.",
        actorName: "Sistema",
        createdAt: seed.openedAt
      }
    ];
    if (analyst) {
      histories.push({
        processId: process.id,
        status: ProcessStatus.EM_ANALISE,
        description: `Processo distribuido para ${analyst.name}.`,
        actorName: users.admin.name,
        createdAt: plusDays(seed.openedAt, 1)
      });
    }
    if (seed.status !== ProcessStatus.RECEBIDO && seed.status !== ProcessStatus.EM_ANALISE) {
      const description = seed.status === ProcessStatus.AGUARDANDO_DOCUMENTOS
        ? "Complementacao documental solicitada ao empreendedor."
        : seed.status === ProcessStatus.DEFERIDO
          ? "Pedido deferido apos conclusao da analise tecnica."
          : seed.status === ProcessStatus.INDEFERIDO
            ? "Pedido indeferido com fundamentacao em parecer tecnico."
            : "Processo arquivado apos encerramento do prazo regulamentar.";
      histories.push({
        processId: process.id,
        status: seed.status,
        description,
        actorName: analyst?.name ?? users.admin.name,
        createdAt: seed.decidedAt ?? plusDays(seed.openedAt, 7)
      });
    }
    await prisma.processHistory.createMany({ data: histories });

    if (seed.messages?.length) {
      await prisma.message.createMany({
        data: seed.messages.map((message) => ({ processId: process.id, senderName: message.sender, content: message.content, createdAt: message.createdAt }))
      });
    }
    if (seed.opinion && analyst) {
      await prisma.opinion.create({
        data: { processId: process.id, authorId: analyst.id, conclusion: seed.opinion.conclusion, content: seed.opinion.content, createdAt: seed.opinion.createdAt }
      });
    }
    if (seed.conditions?.length) {
      await prisma.condition.createMany({
        data: seed.conditions.map((condition) => ({
          processId: process.id,
          description: condition.description,
          dueDate: condition.dueDate,
          status: condition.status,
          completedAt: condition.status === "CUMPRIDA" ? plusDays(condition.dueDate, -5) : null
        }))
      });
    }
    if (seed.inspection) {
      const fiscal = users[seed.inspection.fiscalKey];
      await prisma.inspection.create({
        data: {
          processId: process.id,
          fiscalId: fiscal.id,
          type: seed.inspection.type,
          scheduledAt: seed.inspection.scheduledAt,
          latitude: enterprise.latitude,
          longitude: enterprise.longitude,
          report: seed.inspection.report,
          photos: seed.inspection.status === "VALIDADA" ? ["vistoria-area-geral.jpg", "controle-ambiental.jpg"] : [],
          status: seed.inspection.status,
          validatedAt: seed.inspection.status === "VALIDADA" ? plusDays(seed.inspection.scheduledAt, 1) : null,
          validatedBy: seed.inspection.status === "VALIDADA" ? fiscal.name : null,
          validationNotes: seed.inspection.validationNotes
        }
      });
    }
    if (seed.issuedDocument) {
      await prisma.issuedDocument.create({
        data: { processId: process.id, ...seed.issuedDocument }
      });
    }
    processRecords.push({ id: process.id, number: process.number });
  }

  const originalDemoProcess = await prisma.process.findUnique({ where: { number: "2025.000124" } });
  if (originalDemoProcess) {
    await prisma.inspection.deleteMany({ where: { processId: originalDemoProcess.id } });
    await prisma.inspection.create({
      data: {
        processId: originalDemoProcess.id,
        fiscalId: users.juliana.id,
        type: InspectionType.VISTORIA,
        scheduledAt: date("2025-06-05"),
        latitude: -3.9412,
        longitude: -42.9231,
        report: "Vistoria inicial para verificacao da area diretamente afetada.",
        photos: ["vistoria-area-geral.jpg"],
        status: "VALIDADA",
        validatedAt: date("2025-06-06"),
        validatedBy: users.juliana.name,
        validationNotes: "Area vistoriada e registro tecnico anexado ao processo."
      }
    });
  }

  const feeSeeds = [
    { activityId: activities.construction.id, licenseType: LicenseType.LP, size: "Medio", amountCents: 125000 },
    { activityId: activities.construction.id, licenseType: LicenseType.LI, size: "Medio", amountCents: 145000 },
    { activityId: activities.construction.id, licenseType: LicenseType.LO, size: "Medio", amountCents: 168000 },
    { activityId: activities.rural.id, licenseType: LicenseType.LUA, size: "Grande", amountCents: 390000 },
    { activityId: activities.rural.id, licenseType: LicenseType.LUAR, size: "Grande", amountCents: 420000 },
    { activityId: activities.rural.id, licenseType: LicenseType.AQC, size: "Grande", amountCents: 85000 },
    { activityId: activities.fuel.id, licenseType: LicenseType.LO, size: "Medio", amountCents: 315000 },
    { activityId: activities.fuel.id, licenseType: LicenseType.LOC, size: "Medio", amountCents: 365000 },
    { activityId: activities.food.id, licenseType: LicenseType.LO, size: "Medio", amountCents: 210000 },
    { activityId: activities.food.id, licenseType: LicenseType.RENOVACAO, size: "Medio", amountCents: 165000 },
    { activityId: activities.recycling.id, licenseType: LicenseType.DISPENSA, size: "Pequeno", amountCents: 35000 },
    { activityId: activities.ceramic.id, licenseType: LicenseType.LP, size: "Medio", amountCents: 285000 }
  ];
  for (const seed of feeSeeds) {
    const existing = await prisma.fee.findFirst({ where: { activityId: seed.activityId, licenseType: seed.licenseType, size: seed.size } });
    if (existing) await prisma.fee.update({ where: { id: existing.id }, data: { amountCents: seed.amountCents } });
    else await prisma.fee.create({ data: seed });
  }

  const rules = [
    { licenseType: LicenseType.LP, displayName: "Licenca Previa", deadlineDays: 30, validityDays: 730, requiresInspection: true, requiredDocuments: ["Estudo ambiental", "Certidao de uso do solo"] },
    { licenseType: LicenseType.LI, displayName: "Licenca de Instalacao", deadlineDays: 30, validityDays: 1095, requiresInspection: false, requiredDocuments: ["Projeto ambiental", "ART"] },
    { licenseType: LicenseType.LO, displayName: "Licenca de Operacao", deadlineDays: 30, validityDays: 1460, requiresInspection: true, requiredDocuments: ["Relatorio de implantacao", "Comprovante de condicionantes"] },
    { licenseType: LicenseType.LOC, displayName: "Licenca de Operacao Corretiva", deadlineDays: 45, validityDays: 1095, requiresInspection: true, requiredDocuments: ["Relatorio ambiental", "Plano de controle corretivo"] },
    { licenseType: LicenseType.LUA, displayName: "Licenca Unica Ambiental", deadlineDays: 30, validityDays: 1460, requiresInspection: true, requiredDocuments: ["CAR", "Projeto ambiental", "Memorial descritivo"] },
    { licenseType: LicenseType.LUAR, displayName: "Licenca Unica Ambiental de Regularizacao", deadlineDays: 45, validityDays: 1460, requiresInspection: true, requiredDocuments: ["CAR", "PRADA", "Termo de compromisso ambiental"] },
    { licenseType: LicenseType.AQC, displayName: "Autorizacao de Queima Controlada", deadlineDays: 20, validityDays: 180, requiresInspection: true, requiredDocuments: ["Croqui da area", "Plano de controle"] },
    { licenseType: LicenseType.AUTORIZACAO, displayName: "Autorizacao Ambiental", deadlineDays: 20, validityDays: 365, requiresInspection: false, requiredDocuments: ["Memorial da atividade"] },
    { licenseType: LicenseType.DISPENSA, displayName: "Declaracao de Dispensa", deadlineDays: 20, validityDays: 365, requiresInspection: false, requiredDocuments: ["Declaracao da atividade"] },
    { licenseType: LicenseType.RENOVACAO, displayName: "Renovacao de Licenca", deadlineDays: 30, validityDays: 1460, requiresInspection: true, requiredDocuments: ["Licenca anterior", "Relatorio de cumprimento de condicionantes"] }
  ];
  for (const rule of rules) {
    await prisma.licenseRule.upsert({
      where: { licenseType: rule.licenseType },
      update: { ...rule, legalBasis: "Lei Municipal 756/2024 e regulamentacao municipal aplicavel", isActive: true },
      create: { ...rule, legalBasis: "Lei Municipal 756/2024 e regulamentacao municipal aplicavel", isActive: true }
    });
  }

  const news = [
    { title: "Atendimento digital para licenciamento ambiental", body: "Empreendedores podem consultar processos e acompanhar pendências pela plataforma municipal.", publishedAt: date("2026-07-28") },
    { title: "Agenda de orientação aos empreendedores", body: "A Secretaria realizará atendimento técnico orientativo para novos pedidos de licença ambiental.", publishedAt: date("2026-07-21") },
    { title: "Consulta pública e validação de licenças", body: "Documentos emitidos pelo município podem ser validados com o código de autenticidade informado na licença.", publishedAt: date("2026-07-14") }
  ];
  await prisma.news.deleteMany({
    where: {
      title: {
        in: [
          ...news.map((item) => item.title),
          "Agenda de orientacao aos empreendedores",
          "Consulta publica e validacao de licencas"
        ]
      }
    }
  });
  await prisma.news.createMany({ data: news });

  const institutionalContent = [
    {
      type: InstitutionalContentType.MANUAL,
      title: "Manual do usuário da plataforma",
      summary: "Orientações para consulta pública, solicitação, análise, fiscalização e administração.",
      body: "Empreendedores cadastram empreendimentos, responsáveis técnicos e solicitações; analistas tratam documentos, pareceres e condicionantes; fiscais registram ações de campo; administradores gerenciam equipe, regras, taxas, conteúdo e relatórios. Acompanhe cada processo pelo histórico e pela central de notificações.",
      reference: "Manual operacional do Licença Buriti",
      isPublished: true,
      publishedAt: date("2026-07-30")
    },
    {
      type: InstitutionalContentType.LEGISLACAO,
      title: "Lei Municipal nº 756/2024",
      summary: "Base municipal dos atos e procedimentos de licenciamento ambiental.",
      body: "Dispõe sobre o licenciamento ambiental municipal, tipos de licença, autorizações, fiscalização, taxas e procedimentos aplicáveis no Município de Buriti.",
      reference: "Lei Municipal 756/2024",
      isPublished: true,
      publishedAt: date("2026-07-01")
    }
  ];
  for (const content of institutionalContent) {
    const existing = await prisma.institutionalContent.findFirst({ where: { type: content.type, title: content.title } });
    if (existing) await prisma.institutionalContent.update({ where: { id: existing.id }, data: content });
    else await prisma.institutionalContent.create({ data: content });
  }

  const templates = [
    { name: "Licenca Ambiental Municipal", type: "Licenca", content: "Concede-se a licenca ambiental ao empreendimento {{empreendimento}}, processo {{processo}}, observadas as condicionantes anexas." },
    { name: "Parecer Tecnico", type: "Parecer", content: "Apos analise documental e vistoria, conclui-se pelo {{resultado}} do pedido, conforme fundamentos tecnicos registrados." },
    { name: "Notificacao de Complementacao", type: "Notificacao", content: "Notifica-se o empreendedor para apresentar a documentacao complementar indicada no prazo regulamentar." },
    { name: "Declaracao Ambiental", type: "Declaracao", content: "Declara-se, para os devidos fins, que o empreendimento {{empreendimento}} consta no processo {{processo}}." },
    { name: "Oficio Administrativo", type: "Oficio", content: "Oficio referente ao processo {{processo}} e ao empreendimento {{empreendimento}}." },
    { name: "Relatorio de Vistoria", type: "Relatorio", content: "Relatorio da vistoria realizada em {{data}}, no empreendimento {{empreendimento}}, processo {{processo}}." },
    { name: "Termo de Indeferimento", type: "Decisao", content: "Comunica-se o indeferimento do processo {{processo}}, pelos fundamentos constantes no parecer tecnico." }
  ];
  for (const template of templates) {
    await prisma.documentTemplate.upsert({
      where: { name: template.name },
      update: { ...template, isActive: true },
      create: { ...template, isActive: true }
    });
  }

  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {
      agency: "Secretaria Municipal de Meio Ambiente e Turismo",
      municipality: "Buriti - MA",
      analysisDeadlineDays: 30,
      expirationAlertDays: 45,
      maxUploadMb: 10,
      publicSearchEnabled: true
    },
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

  const sequence = await prisma.processSequence.findUnique({ where: { year: 2026 } });
  await prisma.processSequence.upsert({
    where: { year: 2026 },
    update: { nextNumber: Math.max(sequence?.nextNumber ?? 1, 200) },
    create: { year: 2026, nextNumber: 200 }
  });

  await prisma.auditLog.deleteMany({ where: { entityId: { in: processRecords.map((process) => process.id) } } });
  await prisma.auditLog.createMany({
    data: processRecords.flatMap((process, index) => [
      {
        userId: users.admin.id,
        requestId: `demo-seed-${process.number}-create`,
        action: "PROCESS_CREATE",
        entity: "Process",
        entityId: process.id,
        metadata: { source: "demo_seed", number: process.number },
        createdAt: plusDays(date("2026-07-01"), index)
      },
      {
        userId: index % 2 === 0 ? users.rafael.id : users.camila.id,
        requestId: `demo-seed-${process.number}-review`,
        action: index % 3 === 0 ? "PROCESS_STATUS" : "PROCESS_REVIEW",
        entity: "Process",
        entityId: process.id,
        metadata: { source: "demo_seed", number: process.number },
        createdAt: plusDays(date("2026-07-10"), index)
      }
    ])
  });

  logger.info({
    action: "DEMO_SEED_COMPLETED",
    users: Object.keys(users).length,
    entrepreneurs: Object.keys(entrepreneurs).length,
    enterprises: Object.keys(enterprises).length,
    activities: Object.keys(activities).length,
    processes: processRecords.length,
    validationCode: "BURITI-DEMO-LO-2026-104"
  }, "demo_seed_completed");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    logger.error({ action: "DEMO_SEED_FAILED", error: error instanceof Error ? error.message : "Falha ao carregar demonstracao." }, "demo_seed_failed");
    await prisma.$disconnect();
    process.exit(1);
  });
