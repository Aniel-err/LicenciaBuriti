import type { AppState, Atividade, Configuracao, Documento, Empreendedor, Empreendimento, Fiscalizacao, ModeloDocumento, Perfil, Processo, Status, Taxa, TimelineItem, Usuario } from "./types";

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
  cnpj?: string | null;
  legalRepresentative?: string | null;
  phone: string;
  email: string;
  address: string;
};

type ApiActivity = {
  id: string;
  code: string;
  description: string;
  size: string;
  pollutionLevel: string;
  requiredLicenses: string[];
  requiredDocuments: string[];
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
  size: string;
  pollutionLevel: string;
  propertyClass: string;
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
  number: string;
  issuedAt: string;
  validUntil?: string | null;
};

type ApiProcess = {
  id: string;
  number: string;
  protocol: string;
  entrepreneurId: string;
  enterpriseId: string;
  analyst?: { name: string } | null;
  licenseType: string;
  status: string;
  openedAt: string;
  dueDate: string;
  documents: ApiDocument[];
  messages?: ApiMessage[];
  history?: ApiHistory[];
  issuedDocs?: ApiIssuedDocument[];
  conditions?: Array<{ description: string }>;
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
    responsavelLegal: item.legalRepresentative ?? item.name,
    telefone: item.phone,
    email: item.email,
    endereco: item.address
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
    documentos: item.requiredDocuments
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
    porte: item.size,
    potencial: item.pollutionLevel,
    classificacao: item.propertyClass === "Rural" ? "Rural" : "Urbano"
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
    analista: item.analyst?.name ?? "Aguardando distribuicao",
    prazo: formatDate(item.dueDate),
    status: statusFromApi(item.status, Boolean(license)),
    abertura: formatDate(item.openedAt),
    condicionantes: (item.conditions ?? []).map((condition) => condition.description),
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
    licencaEmitida: license ? { numero: license.number, data: formatDate(license.issuedAt), validade: formatDate(license.validUntil) } : undefined
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
    fotos: []
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

export async function loadAppState(token: string, perfil: Perfil, current: AppState): Promise<AppState> {
  const [processes, entrepreneurs, enterprises, activities, fees, inspections, config, templates, users, audit] = await Promise.all([
    apiFetch<ApiProcess[]>("/processes", token),
    apiFetch<ApiEntrepreneur[]>("/entrepreneurs", token),
    apiFetch<ApiEnterprise[]>("/enterprises", token),
    apiFetch<ApiActivity[]>("/catalog/activities", token),
    apiFetch<ApiFee[]>("/catalog/fees", token),
    apiFetch<ApiInspection[]>("/inspections", token),
    apiFetch<ApiConfig>("/settings", token),
    ["Administrador", "Analista"].includes(perfil) ? apiFetch<ApiTemplate[]>("/document-templates", token) : Promise.resolve([]),
    perfil === "Administrador" ? apiFetch<Array<ApiUser & { phone?: string; isActive: boolean; createdAt: string }>>("/admin/users", token) : Promise.resolve([]),
    perfil === "Administrador" ? apiFetch<ApiAudit[]>("/admin/audit", token) : Promise.resolve([])
  ]);

  return {
    ...current,
    processos: processes.map(mapProcess),
    empreendedores: entrepreneurs.map(mapEntrepreneur),
    empreendimentos: enterprises.map(mapEnterprise),
    atividades: activities.map(mapActivity),
    taxas: fees.map(mapFee),
    fiscalizacoes: inspections.map(mapInspection),
    configuracao: mapConfig(config),
    modelos: templates.map(mapTemplate),
    usuarios: users.length > 0 ? users.map((user) => ({ ...mapUser(user), telefone: user.phone ?? "", ativo: user.isActive, ultimoAcesso: formatDateTime(user.createdAt) })) : current.usuarios,
    auditoria: audit.map((item) => ({
      id: item.id,
      data: formatDateTime(item.createdAt),
      usuario: item.user?.name ?? item.user?.email ?? "Sistema",
      acao: item.action,
      entidade: item.entity,
      detalhe: item.entityId ?? "-"
    })),
    notificacoes: current.notificacoes
  };
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

export async function createOpinionApi(token: string, processId: string, content: string) {
  return apiFetch(`/processes/${processId}/opinions`, token, {
    method: "POST",
    body: JSON.stringify({ conclusion: content.slice(0, 180), content })
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

export async function issueLicenseApi(token: string, processId: string) {
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  const response = await friendlyFetch(`${API_BASE_URL}/official-documents/processes/${processId}/license`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ validUntil: validUntil.toISOString(), conditions: [] })
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Nao foi possivel emitir a licenca."));
  }
  return response.blob();
}

export async function createEntrepreneurApi(token: string, data: Record<string, string>) {
  return apiFetch<ApiEntrepreneur>("/entrepreneurs", token, {
    method: "POST",
    body: JSON.stringify({
      personType: "PJ",
      name: data.nome,
      cnpj: data.documento,
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
      latitude: data.latitude || undefined,
      longitude: data.longitude || undefined,
      areaHectares: data.area ? Number(data.area.replace(",", ".")) : undefined,
      size: activity?.porte ?? "Medio",
      pollutionLevel: activity?.potencial ?? "Medio",
      propertyClass: "Urbano"
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
      requiredDocuments: (data.documentos || "Requerimento").split("\n").map((item) => item.trim()).filter(Boolean)
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

export async function createInspectionApi(token: string, data: Record<string, string>, processId: string, fiscalId?: string) {
  if (!fiscalId) throw new Error("Informe um fiscal valido");
  return apiFetch<ApiInspection>("/inspections", token, {
    method: "POST",
    body: JSON.stringify({
      processId,
      fiscalId,
      type: data.tipo === "Embargo" ? "EMBARGO" : data.tipo === "Notificacao" ? "NOTIFICACAO" : data.tipo === "Auto de infracao" ? "AUTO_INFRACAO" : "VISTORIA",
      scheduledAt: data.data ? new Date(data.data).toISOString() : undefined,
      report: data.relatorio,
      photos: []
    })
  });
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
  return publicFetch<Array<{ number: string; enterprise: string; licenseType: string; status: string; validUntil?: string | null }>>(`/public/processes?q=${encodeURIComponent(query)}`);
}
