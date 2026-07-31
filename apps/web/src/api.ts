import type { AppState, Atividade, Configuracao, ConteudoInstitucional, Documento, Empreendedor, Empreendimento, Fiscalizacao, ModeloDocumento, Notificacao, Perfil, Processo, ResponsavelTecnico, Status, Taxa, TimelineItem, Usuario } from "./types";

export type ApiRole = "ADMIN" | "ANALISTA" | "FISCAL" | "EMPREENDEDOR";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: ApiRole;
  entrepreneurId?: string | null;
};

export type LoginResponse = {
  token: string;
  user: ApiUser;
};

const API_BASE_URL = import.meta.env?.VITE_API_URL ?? "http://localhost:3333";
const DEFAULT_API_ERROR = "Nao foi possivel concluir a operacao. Tente novamente.";
const NETWORK_ERROR = "Nao foi possivel acessar o sistema agora. Tente novamente em instantes.";

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
};

function textFromPayload(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "";
}

function fallbackMessageForStatus(status: number) {
  if (status === 400) return "Revise os dados enviados e tente novamente.";
  if (status === 401) return "Sua sessao expirou. Entre novamente.";
  if (status === 403) return "Voce nao tem permissao para executar esta acao.";
  if (status === 404) return "Nao encontramos o recurso solicitado.";
  if (status === 409) return "Nao foi possivel concluir porque os dados entram em conflito com outro registro.";
  if (status === 413) return "O arquivo ou conteudo enviado e maior que o limite permitido.";
  if (status === 429) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  return "Nao foi possivel concluir a operacao agora. Tente novamente em instantes.";
}

async function readApiError(response: Response, fallback = DEFAULT_API_ERROR) {
  const body = await response.json().catch(() => null) as ApiErrorPayload | null;
  const payloadMessage = textFromPayload(body?.error) || textFromPayload(body?.message);
  if (payloadMessage) return payloadMessage;
  return fallback === DEFAULT_API_ERROR ? fallbackMessageForStatus(response.status) : fallback;
}

async function friendlyFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

async function readDownload(response: Response, fallback: string) {
  if (!response.ok) throw new Error(await readApiError(response, fallback));
  if (response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(await readApiError(response, fallback));
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("O arquivo está vazio ou não está disponível para download.");
  return blob;
}

export function getUserErrorMessage(error: unknown, fallback = DEFAULT_API_ERROR) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function perfilFromRole(role: ApiRole): Exclude<Perfil, "Público"> {
  const map: Record<ApiRole, Exclude<Perfil, "Público">> = {
    ADMIN: "Administrador",
    ANALISTA: "Analista",
    FISCAL: "Fiscal",
    EMPREENDEDOR: "Empreendedor"
  };
  return map[role];
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const response = await friendlyFetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Nao foi possivel autenticar. Confira seus dados e tente novamente."));
  }

  return response.json() as Promise<LoginResponse>;
}

export async function registerApi(data: Record<string, string>): Promise<LoginResponse> {
  const response = await friendlyFetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personType: data.tipo === "PF" ? "PF" : "PJ",
      name: data.nome,
      email: data.email,
      password: data.senha,
      phone: data.telefone,
      address: data.endereco,
      cpf: data.tipo === "PF" ? data.cpf : undefined,
      rg: data.tipo === "PF" ? data.rg : undefined,
      companyName: data.tipo === "PJ" ? data.nome : undefined,
      tradeName: data.tipo === "PJ" ? data.nomeFantasia : undefined,
      cnpj: data.tipo === "PJ" ? data.cnpj : undefined,
      stateRegistration: data.tipo === "PJ" ? data.inscricaoEstadual : undefined,
      legalRepresentative: data.tipo === "PJ" ? data.responsavelLegal : undefined
    })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel concluir o cadastro."));
  return response.json() as Promise<LoginResponse>;
}

export async function forgotPasswordApi(email: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel solicitar a redefinicao."));
  return response.json() as Promise<{ message: string; developmentResetToken?: string }>;
}

export async function resetPasswordApi(token: string, password: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel redefinir a senha."));
}

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await friendlyFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("licencia:unauthorized"));
    }
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function publicFetch<T>(path: string): Promise<T> {
  const response = await friendlyFetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(await readApiError(response, "Nao foi possivel carregar a consulta publica."));
  return response.json() as Promise<T>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusFromApi(status: string, hasLicense = false): Status {
  if (hasLicense) return "Licença emitida";
  const map: Record<string, Status> = {
    RECEBIDO: "Recebido",
    EM_ANALISE: "Em análise",
    AGUARDANDO_DOCUMENTOS: "Aguardando documentos",
    DEFERIDO: "Deferido",
    INDEFERIDO: "Indeferido",
    ARQUIVADO: "Arquivado"
  };
  return map[status] ?? "Recebido";
}

function statusToApi(status: Status) {
  const map: Partial<Record<Status, string>> = {
    Recebido: "RECEBIDO",
    "Em análise": "EM_ANALISE",
    "Aguardando documentos": "AGUARDANDO_DOCUMENTOS",
    Deferido: "DEFERIDO",
    Indeferido: "INDEFERIDO",
    Arquivado: "ARQUIVADO",
    "Licença emitida": "DEFERIDO"
  };
  return map[status] ?? "EM_ANALISE";
}

function documentStatusFromApi(status: string): Documento["status"] {
  const map: Record<string, Documento["status"]> = {
    PENDENTE: "Pendente",
    ENVIADO: "Enviado",
    VALIDADO: "Validado",
    RECUSADO: "Recusado"
  };
  return map[status] ?? "Pendente";
}

function roleToPerfil(role: ApiRole): Exclude<Perfil, "Público"> {
  return perfilFromRole(role);
}

function perfilToRole(perfil: Usuario["perfil"]): ApiRole {
  const map: Record<Usuario["perfil"], ApiRole> = {
    Administrador: "ADMIN",
    Analista: "ANALISTA",
    Fiscal: "FISCAL",
    Empreendedor: "EMPREENDEDOR"
  };
  return map[perfil];
}

type ApiEntrepreneur = {
  id: string;
  userId?: string | null;
  personType: "PF" | "PJ";
  name: string;
  cpf?: string | null;
  rg?: string | null;
  companyName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  legalRepresentative?: string | null;
  phone: string;
  email: string;
  address: string;
};

type ApiTechnicalManager = {
  id: string;
  entrepreneurId: string;
  enterpriseId?: string | null;
  name: string;
  cpf: string;
  council?: string | null;
  professionalId: string;
  artAvailable?: boolean;
  phone: string;
  email: string;
};

type ApiActivity = {
  id: string;
  code: string;
  description: string;
  size: string;
  pollutionLevel: string;
  requiredLicenses: string[];
  requiredDocuments: string[];
  legalBasis?: string | null;
  isActive?: boolean;
};

type ApiEnterprise = {
  id: string;
  entrepreneurId: string;
  name: string;
  address: string;
  municipality: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  activityId: string;
  areaHectares?: string | number | null;
  fiscalModules?: string | number | null;
  size: string;
  pollutionLevel: string;
  propertyClass: string;
  district?: string | null;
  zone?: string | null;
};

type ApiDocument = {
  id: string;
  name: string;
  fileName?: string | null;
  status: string;
  notes?: string | null;
};

type ApiHistory = {
  id: string;
  status: string;
  description: string;
  actorName: string;
  createdAt: string;
};

type ApiMessage = {
  id: string;
  senderName: string;
  content: string;
  createdAt: string;
};

type ApiIssuedDocument = {
  id: string;
  type: string;
  number: string;
  issuedAt: string;
  validUntil?: string | null;
  filePath?: string | null;
};

type ApiOpinion = {
  id: string;
  conclusion: string;
  content: string;
  createdAt: string;
  author?: { name?: string | null } | null;
};

type ApiCondition = {
  id: string;
  description: string;
  dueDate: string;
  status: string;
  notes?: string | null;
  completedAt?: string | null;
};

type ApiProcess = {
  id: string;
  number: string;
  protocol: string;
  entrepreneurId: string;
  enterpriseId: string;
  enterprise?: { name: string } | null;
  analyst?: { name: string } | null;
  licenseType: string;
  status: string;
  openedAt: string;
  dueDate: string;
  documents: ApiDocument[];
  messages?: ApiMessage[];
  history?: ApiHistory[];
  issuedDocs?: ApiIssuedDocument[];
  opinions?: ApiOpinion[];
  conditions?: ApiCondition[];
  renewalOfId?: string | null;
};

type ApiInspection = {
  id: string;
  processId: string;
  type: string;
  scheduledAt?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  report: string;
  fiscalName?: string | null;
  status?: string | null;
  validatedAt?: string | null;
  validatedBy?: string | null;
  validationNotes?: string | null;
  attachments?: Array<{ id: string; fileName: string; mimeType: string }>;
};

type ApiFee = {
  id: string;
  activityId: string;
  licenseType: string;
  size: string;
  amountCents: number;
};

type ApiAudit = {
  id: string;
  createdAt: string;
  user?: { name?: string | null; email?: string | null } | null;
  action: string;
  entity: string;
  entityId?: string | null;
};

type ApiTemplate = {
  id: string;
  name: string;
  type: string;
  content: string;
  isActive: boolean;
};

type ApiConfig = {
  agency: string;
  municipality: string;
  analysisDeadlineDays: number;
  expirationAlertDays: number;
  maxUploadMb: number;
  publicSearchEnabled: boolean;
};

type ApiInstitutionalContent = {
  id: string;
  type: "MANUAL" | "LEGISLACAO";
  title: string;
  summary?: string | null;
  body: string;
  reference?: string | null;
  publishedAt: string;
  isPublished: boolean;
};

type ApiNewsAdmin = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  isPublished: boolean;
};

function mapInstitutionalContent(item: ApiInstitutionalContent): ConteudoInstitucional {
  return {
    id: item.id,
    tipo: item.type === "MANUAL" ? "Manual" : "Legislação",
    titulo: item.title,
    resumo: item.summary ?? undefined,
    conteudo: item.body,
    referencia: item.reference ?? undefined,
    publicadoEm: formatDate(item.publishedAt),
    publicado: item.isPublished
  };
}

function mapNewsContent(item: ApiNewsAdmin): ConteudoInstitucional {
  return {
    id: item.id,
    tipo: "Notícia",
    titulo: item.title,
    conteudo: item.body,
    publicadoEm: formatDate(item.publishedAt),
    publicado: item.isPublished
  };
}

export function mapUser(user: ApiUser): Usuario {
  return {
    id: user.id,
    nome: user.name,
    email: user.email,
    senha: "",
    perfil: roleToPerfil(user.role),
    telefone: "",
    ativo: true,
    ultimoAcesso: "-",
    empreendedorId: user.entrepreneurId ?? undefined
  };
}

function mapEntrepreneur(item: ApiEntrepreneur): Empreendedor {
  return {
    id: item.id,
    tipo: item.personType,
    nome: item.name,
    documento: item.cnpj ?? item.cpf ?? "-",
    cpf: item.cpf ?? undefined,
    rg: item.rg ?? undefined,
    razaoSocial: item.companyName ?? undefined,
    nomeFantasia: item.tradeName ?? undefined,
    cnpj: item.cnpj ?? undefined,
    inscricaoEstadual: item.stateRegistration ?? undefined,
    responsavelLegal: item.legalRepresentative ?? item.name,
    telefone: item.phone,
    email: item.email,
    endereco: item.address
  };
}

function mapTechnicalManager(item: ApiTechnicalManager): ResponsavelTecnico {
  return {
    id: item.id,
    empreendedorId: item.entrepreneurId,
    empreendimentoId: item.enterpriseId ?? undefined,
    nome: item.name,
    cpf: item.cpf,
    conselho: item.council ?? "",
    registroProfissional: item.professionalId,
    telefone: item.phone,
    email: item.email,
    artDisponivel: Boolean(item.artAvailable)
  };
}

function mapActivity(item: ApiActivity): Atividade {
  return {
    id: item.id,
    codigo: item.code,
    descricao: item.description,
    porte: item.size,
    potencial: item.pollutionLevel,
    licencas: item.requiredLicenses,
    documentos: item.requiredDocuments,
    baseLegal: item.legalBasis ?? undefined,
    ativo: item.isActive ?? true
  };
}

function mapEnterprise(item: ApiEnterprise): Empreendimento {
  return {
    id: item.id,
    empreendedorId: item.entrepreneurId,
    nome: item.name,
    endereco: item.address,
    municipio: item.municipality,
    latitude: String(item.latitude ?? ""),
    longitude: String(item.longitude ?? ""),
    atividadeId: item.activityId,
    area: item.areaHectares ? `${item.areaHectares} ha` : "",
    modulosFiscais: item.fiscalModules ? String(item.fiscalModules) : "",
    porte: item.size,
    potencial: item.pollutionLevel,
    classificacao: item.propertyClass.toLowerCase() === "rural" ? "Rural" : "Urbano",
    bairro: item.district ?? undefined,
    zona: item.zone === "RURAL" ? "RURAL" : "URBANA"
  };
}

function mapProcess(item: ApiProcess): Processo {
  const license = item.issuedDocs?.[0];
  const timeline: TimelineItem[] = (item.history ?? []).map((history, index, source) => ({
    id: history.id,
    label: history.description,
    date: formatDateTime(history.createdAt),
    actor: history.actorName,
    done: true,
    current: index === source.length - 1
  }));

  return {
    id: item.id,
    numero: item.number,
    protocolo: item.protocol,
    tipoLicenca: item.licenseType,
    empreendedorId: item.entrepreneurId,
    empreendimentoId: item.enterpriseId,
    analista: item.analyst?.name ?? "Aguardando distribuição",
    prazo: formatDate(item.dueDate),
    status: statusFromApi(item.status, Boolean(license)),
    abertura: formatDate(item.openedAt),
    condicionantes: (item.conditions ?? []).map((condition) => condition.description),
    pareceres: (item.opinions ?? []).map((opinion) => ({
      id: opinion.id,
      conclusao: opinion.conclusion,
      conteudo: opinion.content,
      autor: opinion.author?.name ?? undefined,
      data: formatDateTime(opinion.createdAt)
    })),
    condicionantesDetalhadas: (item.conditions ?? []).map((condition) => ({
      id: condition.id,
      descricao: condition.description,
      prazo: formatDate(condition.dueDate),
      status: condition.status === "CUMPRIDA" ? "Cumprida" : condition.status === "EM_CUMPRIMENTO" ? "Em cumprimento" : condition.status === "VENCIDA" ? "Vencida" : "Pendente",
      observacao: condition.notes ?? undefined,
      concluidaEm: condition.completedAt ? formatDateTime(condition.completedAt) : undefined
    })),
    documentos: item.documents.map((document) => ({
      id: document.id,
      nome: document.name,
      obrigatorio: true,
      status: documentStatusFromApi(document.status),
      arquivo: document.fileName ?? undefined,
      observacao: document.notes ?? undefined
    })),
    mensagens: (item.messages ?? []).map((message) => ({
      id: message.id,
      autor: message.senderName,
      texto: message.content,
      data: formatDateTime(message.createdAt)
    })),
    timeline,
    licencaEmitida: license ? {
      id: license.id,
      numero: license.number,
      tipo: license.type,
      data: formatDate(license.issuedAt),
      validade: formatDate(license.validUntil),
      disponivelParaDownload: Boolean(license.filePath)
    } : undefined,
    documentosEmitidos: (item.issuedDocs ?? []).map((document) => ({
      id: document.id,
      numero: document.number,
      tipo: document.type,
      emissao: formatDate(document.issuedAt),
      validade: document.validUntil ? formatDate(document.validUntil) : undefined,
      disponivelParaDownload: Boolean(document.filePath)
    })),
    renovacaoDeId: item.renewalOfId ?? undefined
  };
}

function mapInspection(item: ApiInspection): Fiscalizacao {
  return {
    id: item.id,
    processoId: item.processId,
    tipo: item.type === "AUTO_INFRACAO" ? "Auto de infração" : item.type === "EMBARGO" ? "Embargo" : item.type === "NOTIFICACAO" ? "Notificação" : "Vistoria",
    fiscal: item.fiscalName ?? "-",
    data: formatDate(item.scheduledAt),
    gps: [item.latitude, item.longitude].filter(Boolean).join(", "),
    relatorio: item.report,
    status: item.status === "VALIDADA" ? "Validada" : "Agendada",
    validadaEm: formatDateTime(item.validatedAt),
    validadaPor: item.validatedBy ?? undefined,
    conclusao: item.validationNotes ?? undefined,
    fotos: (item.attachments ?? []).filter((attachment) => attachment.mimeType.startsWith("image/")).map((attachment) => attachment.fileName),
    anexos: (item.attachments ?? []).map((attachment) => ({ id: attachment.id, nome: attachment.fileName, tipo: attachment.mimeType }))
  };
}

function mapFee(item: ApiFee): Taxa {
  return {
    id: item.id,
    atividadeId: item.activityId,
    licenca: item.licenseType,
    porte: item.size,
    valor: item.amountCents / 100
  };
}

function mapConfig(item: ApiConfig): Configuracao {
  return {
    orgao: item.agency,
    municipio: item.municipality,
    prazoAnaliseDias: item.analysisDeadlineDays,
    alertaVencimentoDias: item.expirationAlertDays,
    tamanhoMaxUploadMb: item.maxUploadMb,
    consultaPublicaAtiva: item.publicSearchEnabled
  };
}

function mapTemplate(item: ApiTemplate): ModeloDocumento {
  return {
    id: item.id,
    nome: item.name,
    tipo: item.type as ModeloDocumento["tipo"],
    conteudo: item.content,
    ativo: item.isActive
  };
}

type ApiNotification = {
  id: string;
  processId?: string | null;
  type: "PRAZO_PROCESSO" | "DOCUMENTO" | "CONDICIONANTE" | "LICENCA" | "SISTEMA";
  title: string;
  message: string;
  dueAt?: string | null;
  isRead: boolean;
  createdAt: string;
};

function mapNotification(item: ApiNotification): Notificacao {
  const types: Record<ApiNotification["type"], Notificacao["tipo"]> = {
    PRAZO_PROCESSO: "Prazo",
    DOCUMENTO: "Documento",
    CONDICIONANTE: "Condicionante",
    LICENCA: "Licença",
    SISTEMA: "Sistema"
  };
  return {
    id: item.id,
    data: formatDateTime(item.createdAt),
    titulo: item.title,
    mensagem: item.message,
    lida: item.isRead,
    tipo: types[item.type],
    processoId: item.processId ?? undefined,
    vencimento: item.dueAt ? formatDate(item.dueAt) : undefined
  };
}

const auditActionLabels: Record<string, string> = {
  LOGIN: "Acesso ao sistema",
  PUBLIC_REGISTER: "Cadastro público realizado",
  PASSWORD_RESET_REQUEST: "Recuperação de senha solicitada",
  PASSWORD_RESET: "Senha redefinida",
  PASSWORD_CHANGE: "Senha alterada",
  USER_CREATE: "Usuário cadastrado",
  USER_UPDATE: "Usuário atualizado",
  USER_STATUS: "Status do usuário alterado",
  ACTIVITY_CREATE: "Atividade cadastrada",
  ACTIVITY_UPDATE: "Atividade atualizada",
  FEE_CREATE: "Taxa cadastrada",
  FEE_UPDATE: "Taxa atualizada",
  FEE_DELETE: "Taxa excluída",
  LICENSE_RULE_UPDATE: "Regra de licenciamento atualizada",
  TEMPLATE_CREATE: "Modelo cadastrado",
  TEMPLATE_UPDATE: "Modelo atualizado",
  TEMPLATE_DELETE: "Modelo excluído",
  TEMPLATE_STATUS: "Status do modelo alterado",
  DOCUMENT_UPLOAD: "Documento enviado",
  DOCUMENT_STATUS: "Documento analisado",
  DOCUMENT_DOWNLOAD: "Documento baixado",
  DOCUMENT_REQUEST: "Documento complementar solicitado",
  ENTERPRISE_CREATE: "Empreendimento cadastrado",
  ENTERPRISE_UPDATE: "Empreendimento atualizado",
  ENTREPRENEUR_CREATE: "Empreendedor cadastrado",
  ENTREPRENEUR_UPDATE: "Empreendedor atualizado",
  INSPECTION_CREATE: "Fiscalização agendada",
  INSPECTION_UPDATE: "Fiscalização atualizada",
  INSPECTION_ATTACHMENTS_UPLOAD: "Anexos da fiscalização enviados",
  INSPECTION_ATTACHMENT_DOWNLOAD: "Anexo da fiscalização baixado",
  INSPECTION_VALIDATE: "Fiscalização concluída",
  INSTITUTIONAL_CONTENT_CREATE: "Conteúdo público cadastrado",
  INSTITUTIONAL_CONTENT_UPDATE: "Conteúdo público atualizado",
  INSTITUTIONAL_CONTENT_DELETE: "Conteúdo público excluído",
  NEWS_CREATE: "Notícia cadastrada",
  NEWS_UPDATE: "Notícia atualizada",
  NEWS_DELETE: "Notícia excluída",
  NOTIFICATION_READ: "Notificação lida",
  NOTIFICATION_READ_ALL: "Todas as notificações foram lidas",
  NOTIFICATION_SWEEP: "Alertas automáticos verificados",
  OFFICIAL_DOCUMENT_ISSUE: "Documento oficial emitido",
  OFFICIAL_DOCUMENT_DOWNLOAD: "Documento oficial baixado",
  PROCESS_CREATE: "Processo protocolado",
  PROCESS_ASSIGN: "Processo distribuído",
  PROCESS_STATUS: "Situação do processo alterada",
  PROCESS_MESSAGE: "Mensagem enviada no processo",
  PROCESS_OPINION: "Parecer técnico registrado",
  PROCESS_REVIEW: "Processo revisado",
  PROCESS_RENEW: "Renovação solicitada",
  CONDITION_CREATE: "Condicionante cadastrada",
  CONDITION_STATUS: "Situação da condicionante alterada",
  CONDITION_DELETE: "Condicionante excluída",
  SETTINGS_UPDATE: "Configurações atualizadas",
  TECHNICAL_MANAGER_CREATE: "Responsável técnico cadastrado",
  TECHNICAL_MANAGER_UPDATE: "Responsável técnico atualizado",
  TECHNICAL_MANAGER_ART_UPLOAD: "ART enviada",
  TECHNICAL_MANAGER_ART_DOWNLOAD: "ART baixada",
  TECHNICAL_MANAGER_DELETE: "Responsável técnico excluído"
};

const auditEntityLabels: Record<string, string> = {
  Activity: "Atividade",
  Condition: "Condicionante",
  Document: "Documento do processo",
  DocumentTemplate: "Modelo de documento",
  Enterprise: "Empreendimento",
  Entrepreneur: "Empreendedor",
  Fee: "Taxa",
  Inspection: "Fiscalização",
  InspectionAttachment: "Anexo da fiscalização",
  InstitutionalContent: "Conteúdo público",
  IssuedDocument: "Documento oficial",
  LicenseRule: "Regra de licenciamento",
  News: "Notícia",
  Notification: "Notificação",
  Process: "Processo",
  Sessao: "Sessão",
  SystemConfig: "Configuração do sistema",
  TechnicalManager: "Responsável técnico",
  User: "Usuário"
};

function readableAuditValue(value: string, labels: Record<string, string>) {
  return labels[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("pt-BR").replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export async function loadAppState(token: string, perfil: Perfil, current: AppState): Promise<AppState> {
  const [processes, entrepreneurs, technicalManagers, enterprises, activities, fees, inspections, config, templates, contents, news, users, audit, notifications] = await Promise.all([
    apiFetch<ApiProcess[]>("/processes", token),
    apiFetch<ApiEntrepreneur[]>("/entrepreneurs", token),
    apiFetch<ApiTechnicalManager[]>("/technical-managers", token),
    apiFetch<ApiEnterprise[]>("/enterprises", token),
    apiFetch<ApiActivity[]>("/catalog/activities", token),
    apiFetch<ApiFee[]>("/catalog/fees", token),
    apiFetch<ApiInspection[]>("/inspections", token),
    apiFetch<ApiConfig>("/settings", token),
    ["Administrador", "Analista"].includes(perfil) ? apiFetch<ApiTemplate[]>("/document-templates", token) : Promise.resolve([]),
    ["Administrador", "Analista"].includes(perfil) ? apiFetch<ApiInstitutionalContent[]>("/institutional/content", token) : Promise.resolve([]),
    ["Administrador", "Analista"].includes(perfil) ? apiFetch<ApiNewsAdmin[]>("/institutional/news", token) : Promise.resolve([]),
    perfil === "Administrador" ? apiFetch<Array<ApiUser & { phone?: string; isActive: boolean; createdAt: string }>>("/admin/users", token) : Promise.resolve([]),
    perfil === "Administrador" ? apiFetch<ApiAudit[]>("/admin/audit", token) : Promise.resolve([]),
    apiFetch<ApiNotification[]>("/notifications", token)
  ]);

  return {
    ...current,
    processos: processes.map(mapProcess),
    empreendedores: entrepreneurs.map(mapEntrepreneur),
    responsaveisTecnicos: technicalManagers.map(mapTechnicalManager),
    empreendimentos: enterprises.map(mapEnterprise),
    atividades: activities.map(mapActivity),
    taxas: fees.map(mapFee),
    fiscalizacoes: inspections.map(mapInspection),
    configuracao: mapConfig(config),
    modelos: templates.map(mapTemplate),
    conteudos: [...contents.map(mapInstitutionalContent), ...news.map(mapNewsContent)],
    usuarios: users.length > 0 ? users.map((user) => ({ ...mapUser(user), telefone: user.phone ?? "", ativo: user.isActive, ultimoAcesso: formatDateTime(user.createdAt) })) : current.usuarios,
    auditoria: audit.map((item) => ({
      id: item.id,
      data: formatDateTime(item.createdAt),
      usuario: item.user?.name ?? item.user?.email ?? "Sistema",
      acao: readableAuditValue(item.action, auditActionLabels),
      entidade: readableAuditValue(item.entity, auditEntityLabels),
      detalhe: item.entityId ?? "-"
    })),
    notificacoes: notifications.map(mapNotification)
  };
}

export async function markNotificationReadApi(token: string, notificationId: string) {
  return apiFetch<ApiNotification>(`/notifications/${notificationId}/read`, token, { method: "PATCH" });
}

export async function markAllNotificationsReadApi(token: string) {
  return apiFetch<{ updated: number }>("/notifications/read-all", token, { method: "PATCH" });
}

export type DashboardData = {
  metrics: {
    total: number;
    emAnalise: number;
    aguardando: number;
    deferidos: number;
    indeferidos: number;
    emitidas: number;
    vencendo: number;
    vencidas: number;
  };
  groups: {
    status: Array<{ name: string; count: number }>;
    analyst: Array<{ name: string; count: number }>;
    activity: Array<{ name: string; count: number }>;
    month: Array<{ name: string; count: number }>;
  };
  deadlines: Array<{ id: string; description: string; dueDate: string; process: { id: string; number: string } }>;
  processos: ApiProcess[];
};

export async function getDashboardApi(token: string) {
  return apiFetch<DashboardData>("/dashboard", token);
}

export async function createProcessApi(token: string, enterprise: Empreendimento, licenseType: string) {
  return apiFetch<ApiProcess>("/processes", token, {
    method: "POST",
    body: JSON.stringify({ entrepreneurId: enterprise.empreendedorId, enterpriseId: enterprise.id, licenseType })
  });
}

export async function assignProcessApi(token: string, processId: string, analystId?: string) {
  return apiFetch<ApiProcess>(`/processes/${processId}/assign`, token, { method: "PATCH", body: JSON.stringify({ analystId }) });
}

export async function updateProcessStatusApi(token: string, processId: string, status: Status, description: string) {
  return apiFetch<ApiProcess>(`/processes/${processId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status: statusToApi(status), description })
  });
}

export async function sendProcessMessageApi(token: string, processId: string, content: string) {
  return apiFetch<ApiMessage>(`/processes/${processId}/messages`, token, { method: "POST", body: JSON.stringify({ content }) });
}

export async function requestProcessDocumentApi(token: string, processId: string, name: string) {
  return apiFetch<ApiDocument>(`/processes/${processId}/documents`, token, { method: "POST", body: JSON.stringify({ name }) });
}

export async function createOpinionApi(token: string, processId: string, conclusion: string, content: string) {
  return apiFetch(`/processes/${processId}/opinions`, token, {
    method: "POST",
    body: JSON.stringify({ conclusion, content })
  });
}

export async function uploadDocumentApi(token: string, documentId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<ApiDocument>(`/documents/${documentId}/upload`, token, { method: "POST", body });
}

export async function validateDocumentApi(token: string, documentId: string, status: "VALIDADO" | "RECUSADO", notes?: string) {
  return apiFetch<ApiDocument>(`/documents/${documentId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status, notes })
  });
}

export async function downloadDocumentApi(token: string, documentId: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readDownload(response, "Não foi possível baixar o documento.");
}

export async function issueLicenseApi(token: string, processId: string) {
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  const response = await friendlyFetch(`${API_BASE_URL}/official-documents/processes/${processId}/license`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ validUntil: validUntil.toISOString(), conditions: [] })
  });
  return readDownload(response, "Não foi possível emitir a licença.");
}

export async function createEntrepreneurApi(token: string, data: Record<string, string>) {
  return apiFetch<ApiEntrepreneur>("/entrepreneurs", token, {
    method: "POST",
    body: JSON.stringify({
      personType: data.tipo === "PF" ? "PF" : "PJ",
      name: data.nome,
      cpf: data.tipo === "PF" ? data.cpf : undefined,
      rg: data.tipo === "PF" ? data.rg : undefined,
      companyName: data.tipo === "PJ" ? data.nome : undefined,
      tradeName: data.tipo === "PJ" ? data.nomeFantasia : undefined,
      cnpj: data.tipo === "PJ" ? data.cnpj : undefined,
      stateRegistration: data.tipo === "PJ" ? data.inscricaoEstadual : undefined,
      legalRepresentative: data.responsavelLegal,
      phone: data.telefone,
      email: data.email,
      address: data.endereco
    })
  });
}

export async function updateEntrepreneurApi(token: string, entrepreneurId: string, data: Record<string, string>) {
  return apiFetch<ApiEntrepreneur>(`/entrepreneurs/${entrepreneurId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      personType: data.tipo === "PF" ? "PF" : "PJ",
      name: data.nome,
      cpf: data.tipo === "PF" ? data.cpf : undefined,
      rg: data.tipo === "PF" ? data.rg : undefined,
      companyName: data.tipo === "PJ" ? data.nome : undefined,
      tradeName: data.tipo === "PJ" ? data.nomeFantasia : undefined,
      cnpj: data.tipo === "PJ" ? data.cnpj : undefined,
      stateRegistration: data.tipo === "PJ" ? data.inscricaoEstadual : undefined,
      legalRepresentative: data.responsavelLegal,
      phone: data.telefone,
      email: data.email,
      address: data.endereco
    })
  });
}

export async function createEnterpriseApi(token: string, data: Record<string, string>, entrepreneurId: string, activityId: string, activity?: Atividade) {
  return apiFetch<ApiEnterprise>("/enterprises", token, {
    method: "POST",
    body: JSON.stringify({
      entrepreneurId,
      activityId,
      name: data.nome,
      address: data.endereco,
      municipality: data.municipio || "Buriti - MA",
      district: data.bairro || undefined,
      zone: data.zona === "RURAL" ? "RURAL" : "URBANA",
      latitude: data.latitude || undefined,
      longitude: data.longitude || undefined,
      areaHectares: data.area ? Number(data.area.replace(",", ".")) : undefined,
      fiscalModules: data.modulosFiscais ? Number(data.modulosFiscais.replace(",", ".")) : undefined,
      size: data.porte || activity?.porte || "Medio",
      pollutionLevel: data.potencial || activity?.potencial || "Medio",
      propertyClass: data.classificacao || (data.zona === "RURAL" ? "Rural" : "Urbano")
    })
  });
}

export async function updateEnterpriseApi(token: string, enterpriseId: string, data: Record<string, string>, entrepreneurId: string, activityId: string, activity?: Atividade) {
  return apiFetch<ApiEnterprise>(`/enterprises/${enterpriseId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      entrepreneurId,
      activityId,
      name: data.nome,
      address: data.endereco,
      municipality: data.municipio || "Buriti - MA",
      district: data.bairro || undefined,
      zone: data.zona === "RURAL" ? "RURAL" : "URBANA",
      latitude: data.latitude || undefined,
      longitude: data.longitude || undefined,
      areaHectares: data.area ? Number(data.area.replace(",", ".")) : undefined,
      fiscalModules: data.modulosFiscais ? Number(data.modulosFiscais.replace(",", ".")) : undefined,
      size: data.porte || activity?.porte || "Medio",
      pollutionLevel: data.potencial || activity?.potencial || "Medio",
      propertyClass: data.classificacao || (data.zona === "RURAL" ? "Rural" : "Urbano")
    })
  });
}

export async function createActivityApi(token: string, data: Record<string, string>) {
  return apiFetch<ApiActivity>("/catalog/activities", token, {
    method: "POST",
    body: JSON.stringify({
      code: data.codigo,
      description: data.descricao,
      size: data.porte || "Medio",
      pollutionLevel: data.potencial || "Medio",
      requiredLicenses: (data.licencas || "LI").split(",").map((item) => item.trim()).filter(Boolean),
      requiredDocuments: (data.documentos || "Requerimento").split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
      legalBasis: data.baseLegal || undefined,
      isActive: true
    })
  });
}

export async function updateActivityApi(token: string, activityId: string, data: Record<string, string>) {
  return apiFetch<ApiActivity>(`/catalog/activities/${activityId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      code: data.codigo,
      description: data.descricao,
      size: data.porte,
      pollutionLevel: data.potencial,
      requiredLicenses: (data.licencas ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      requiredDocuments: (data.documentos ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
      legalBasis: data.baseLegal || undefined,
      isActive: true
    })
  });
}

export async function createFeeApi(token: string, data: Record<string, string>, activityId: string) {
  return apiFetch<ApiFee>("/catalog/fees", token, {
    method: "POST",
    body: JSON.stringify({
      activityId,
      licenseType: data.licenca || "LI",
      size: data.porte || "Medio",
      amountCents: Math.round((Number((data.valor || "0").replace(",", ".")) || 0) * 100)
    })
  });
}

export async function updateFeeApi(token: string, feeId: string, data: Record<string, string>, activityId: string) {
  return apiFetch<ApiFee>(`/catalog/fees/${feeId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      activityId,
      licenseType: data.licenca,
      size: data.porte,
      amountCents: Math.round((Number((data.valor ?? "0").replace(",", ".")) || 0) * 100)
    })
  });
}

export async function createInspectionApi(token: string, data: Record<string, string>, processId: string, fiscalId?: string, files: File[] = []) {
  if (!fiscalId) throw new Error("Informe um fiscal valido");
  const normalizedType = (data.tipo || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const inspection = await apiFetch<ApiInspection>("/inspections", token, {
    method: "POST",
    body: JSON.stringify({
      processId,
      fiscalId,
      type: normalizedType === "embargo" ? "EMBARGO" : normalizedType === "notificacao" ? "NOTIFICACAO" : normalizedType === "auto de infracao" ? "AUTO_INFRACAO" : "VISTORIA",
      scheduledAt: data.data ? new Date(data.data).toISOString() : undefined,
      latitude: data.latitude || undefined,
      longitude: data.longitude || undefined,
      report: data.relatorio,
      photos: []
    })
  });
  if (files.length) await uploadInspectionAttachmentsApi(token, inspection.id, files);
  return inspection;
}

export async function validateInspectionApi(token: string, inspectionId: string, notes: string) {
  return apiFetch<ApiInspection>(`/inspections/${inspectionId}/validate`, token, {
    method: "PATCH",
    body: JSON.stringify({ notes })
  });
}

export async function createUserApi(token: string, data: Record<string, string>, perfil: Usuario["perfil"], entrepreneurId?: string) {
  return apiFetch<ApiUser>("/admin/users", token, {
    method: "POST",
    body: JSON.stringify({
      name: data.nome,
      email: data.email,
      phone: data.telefone,
      password: data.senha,
      role: perfilToRole(perfil),
      entrepreneurId
    })
  });
}

export async function createTemplateApi(token: string, data: Record<string, string>, tipo: ModeloDocumento["tipo"]) {
  return apiFetch<ApiTemplate>("/document-templates", token, {
    method: "POST",
    body: JSON.stringify({ name: data.nome, type: tipo, content: data.conteudo, isActive: true })
  });
}

export async function updateUserStatusApi(token: string, userId: string, isActive: boolean) {
  return apiFetch(`/admin/users/${userId}/status`, token, { method: "PATCH", body: JSON.stringify({ isActive }) });
}

export async function updateTemplateApi(token: string, template: ModeloDocumento, data: Record<string, string>) {
  return apiFetch<ApiTemplate>(`/document-templates/${template.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      name: data.nome,
      type: data.tipo,
      content: data.conteudo,
      isActive: template.ativo
    })
  });
}

export async function updateUserApi(token: string, userId: string, data: Record<string, string | null>) {
  return apiFetch<ApiUser>(`/admin/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      name: data.nome,
      email: data.email,
      phone: data.telefone || null,
      role: data.perfil ? perfilToRole(data.perfil as Usuario["perfil"]) : undefined,
      password: data.senha || undefined,
      entrepreneurId: data.empreendedorId || null
    })
  });
}

export async function uploadInspectionAttachmentsApi(token: string, inspectionId: string, files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return apiFetch<Array<{ id: string; fileName: string; mimeType: string }>>(`/inspections/${inspectionId}/attachments`, token, { method: "POST", body });
}

export async function downloadInspectionAttachmentApi(token: string, attachmentId: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/inspections/attachments/${attachmentId}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readDownload(response, "Não foi possível baixar o anexo.");
}

export async function createTechnicalManagerApi(token: string, data: Record<string, string>, artFile?: File) {
  const manager = await apiFetch<ApiTechnicalManager>("/technical-managers", token, {
    method: "POST",
    body: JSON.stringify({
      entrepreneurId: data.empreendedorId,
      enterpriseId: data.empreendimentoId || undefined,
      name: data.nome,
      cpf: data.cpf,
      council: data.conselho,
      professionalId: data.registroProfissional,
      phone: data.telefone,
      email: data.email
    })
  });
  if (artFile) {
    const body = new FormData();
    body.append("file", artFile);
    return apiFetch<ApiTechnicalManager>(`/technical-managers/${manager.id}/art`, token, { method: "POST", body });
  }
  return manager;
}

export async function updateTechnicalManagerApi(token: string, managerId: string, data: Record<string, string>, artFile?: File) {
  let manager = await apiFetch<ApiTechnicalManager>(`/technical-managers/${managerId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      entrepreneurId: data.empreendedorId,
      enterpriseId: data.empreendimentoId || undefined,
      name: data.nome,
      cpf: data.cpf,
      council: data.conselho,
      professionalId: data.registroProfissional,
      phone: data.telefone,
      email: data.email
    })
  });
  if (artFile) {
    const body = new FormData();
    body.append("file", artFile);
    manager = await apiFetch<ApiTechnicalManager>(`/technical-managers/${manager.id}/art`, token, { method: "POST", body });
  }
  return manager;
}

export async function downloadTechnicalManagerArtApi(token: string, managerId: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/technical-managers/${managerId}/art`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readDownload(response, "Não foi possível baixar a ART.");
}

export async function issueOfficialDocumentApi(token: string, processId: string, data: {
  type: "LICENCA" | "CERTIDAO" | "DECLARACAO" | "AUTORIZACAO" | "OFICIO" | "NOTIFICACAO" | "PARECER";
  subject?: string;
  body?: string;
  validUntil?: string;
  conditions?: Array<{ description: string; dueDate?: string }>;
}) {
  const response = await friendlyFetch(`${API_BASE_URL}/official-documents/processes/${processId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
  return readDownload(response, "Não foi possível emitir o documento oficial.");
}

export async function downloadIssuedDocumentApi(token: string, documentId: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/official-documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readDownload(response, "Não foi possível baixar o documento emitido.");
}

export async function createConditionApi(token: string, processId: string, description: string, dueDate: string, notes?: string) {
  return apiFetch<ApiCondition>(`/processes/${processId}/conditions`, token, {
    method: "POST",
    body: JSON.stringify({ description, dueDate, notes })
  });
}

export async function updateConditionApi(token: string, processId: string, conditionId: string, status: "PENDENTE" | "EM_CUMPRIMENTO" | "CUMPRIDA" | "VENCIDA", notes?: string) {
  return apiFetch<ApiCondition>(`/processes/${processId}/conditions/${conditionId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ status, notes })
  });
}

export async function renewProcessApi(token: string, processId: string) {
  return apiFetch<ApiProcess>(`/processes/${processId}/renew`, token, { method: "POST" });
}

export async function updateTemplateStatusApi(token: string, templateId: string, isActive: boolean) {
  return apiFetch(`/document-templates/${templateId}/status`, token, { method: "PATCH", body: JSON.stringify({ isActive }) });
}

export async function createInstitutionalContentApi(token: string, data: Record<string, string>) {
  if (data.tipo === "NOTICIA") {
    return apiFetch<ApiNewsAdmin>("/institutional/news", token, {
      method: "POST",
      body: JSON.stringify({
        title: data.titulo,
        body: data.conteudo,
        isPublished: true
      })
    });
  }
  return apiFetch<ApiInstitutionalContent>("/institutional/content", token, {
    method: "POST",
    body: JSON.stringify({
      type: data.tipo === "MANUAL" ? "MANUAL" : "LEGISLACAO",
      title: data.titulo,
      summary: data.resumo || undefined,
      body: data.conteudo,
      reference: data.referencia || undefined,
      isPublished: true
    })
  });
}

export async function updateInstitutionalContentApi(token: string, content: ConteudoInstitucional, data: Record<string, string>) {
  if (content.tipo === "Notícia") {
    return apiFetch<ApiNewsAdmin>(`/institutional/news/${content.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        title: data.titulo,
        body: data.conteudo,
        isPublished: content.publicado
      })
    });
  }
  return apiFetch<ApiInstitutionalContent>(`/institutional/content/${content.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      type: data.tipo === "MANUAL" ? "MANUAL" : "LEGISLACAO",
      title: data.titulo,
      summary: data.resumo || undefined,
      body: data.conteudo,
      reference: data.referencia || undefined,
      isPublished: content.publicado
    })
  });
}

export async function saveSettingsApi(token: string, config: Configuracao) {
  return apiFetch<ApiConfig>("/settings", token, {
    method: "PUT",
    body: JSON.stringify({
      agency: config.orgao,
      municipality: config.municipio,
      analysisDeadlineDays: config.prazoAnaliseDias,
      expirationAlertDays: config.alertaVencimentoDias,
      maxUploadMb: config.tamanhoMaxUploadMb,
      publicSearchEnabled: config.consultaPublicaAtiva
    })
  });
}

export async function publicSearchApi(query: string) {
  if (query.trim().length < 5) return [];
  return publicFetch<Array<{ number: string; enterprise: string; licenseType: string; status: string; validUntil?: string | null; issuedNumber?: string | null; issuedType?: string | null; validationCode?: string | null; downloadAvailable?: boolean }>>(`/public/processes?q=${encodeURIComponent(query)}`);
}

export type PublicLicense = {
  number: string;
  type: string;
  issuedAt: string;
  validUntil?: string | null;
  signedBy?: string | null;
  process: string;
  protocol: string;
  enterprise: string;
  entrepreneur: string;
  status: string;
  fileSha256?: string | null;
  signatureAlgorithm?: string | null;
  signatureValid?: boolean;
  downloadAvailable?: boolean;
};

export type PublicNews = { id: string; title: string; body: string; publishedAt: string };
export type PublicInstitutionalContent = {
  id: string;
  type: "MANUAL" | "LEGISLACAO";
  title: string;
  summary?: string | null;
  body: string;
  reference?: string | null;
  publishedAt: string;
};

export async function validatePublicLicenseApi(code: string) {
  return publicFetch<PublicLicense>(`/public/licenses/${encodeURIComponent(code.trim())}`);
}

export async function downloadPublicLicenseApi(code: string) {
  const response = await friendlyFetch(`${API_BASE_URL}/public/licenses/${encodeURIComponent(code.trim())}/download`);
  return readDownload(response, "Não foi possível baixar o documento.");
}

export async function publicNewsApi() {
  return publicFetch<PublicNews[]>("/public/news");
}

export async function publicInstitutionalContentApi(type: "MANUAL" | "LEGISLACAO") {
  return publicFetch<PublicInstitutionalContent[]>(`/public/content?type=${type}`);
}
