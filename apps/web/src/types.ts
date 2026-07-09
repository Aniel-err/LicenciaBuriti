export type Perfil = "Público" | "Empreendedor" | "Analista" | "Fiscal" | "Administrador";

export type Status =
  | "Recebido"
  | "Distribuído"
  | "Em análise"
  | "Aguardando documentos"
  | "Vistoria agendada"
  | "Parecer emitido"
  | "Deferido"
  | "Indeferido"
  | "Licença emitida"
  | "Arquivado";

export type TipoPessoa = "PF" | "PJ";

export type Empreendedor = {
  id: string;
  tipo: TipoPessoa;
  nome: string;
  documento: string;
  responsavelLegal: string;
  telefone: string;
  email: string;
  endereco: string;
};

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  senha: string;
  perfil: Exclude<Perfil, "Público">;
  telefone: string;
  ativo: boolean;
  ultimoAcesso: string;
  empreendedorId?: string;
};

export type Atividade = {
  id: string;
  codigo: string;
  descricao: string;
  porte: string;
  potencial: string;
  licencas: string[];
  documentos: string[];
};

export type Empreendimento = {
  id: string;
  empreendedorId: string;
  nome: string;
  endereco: string;
  municipio: string;
  latitude: string;
  longitude: string;
  atividadeId: string;
  area: string;
  porte: string;
  potencial: string;
  classificacao: "Urbano" | "Rural";
};

export type Documento = {
  id: string;
  nome: string;
  obrigatorio: boolean;
  status: "Pendente" | "Enviado" | "Validado" | "Recusado";
  arquivo?: string;
  observacao?: string;
};

export type TimelineItem = {
  id: string;
  label: string;
  date: string;
  actor: string;
  done: boolean;
  current?: boolean;
};

export type Processo = {
  id: string;
  numero: string;
  protocolo: string;
  tipoLicenca: string;
  empreendedorId: string;
  empreendimentoId: string;
  analista: string;
  prazo: string;
  status: Status;
  abertura: string;
  parecer?: string;
  condicionantes: string[];
  documentos: Documento[];
  mensagens: Array<{ id: string; autor: string; texto: string; data: string }>;
  timeline: TimelineItem[];
  licencaEmitida?: {
    numero: string;
    data: string;
    validade: string;
  };
};

export type Taxa = {
  id: string;
  atividadeId: string;
  licenca: string;
  porte: string;
  valor: number;
};

export type Fiscalizacao = {
  id: string;
  processoId: string;
  tipo: "Vistoria" | "Auto de infração" | "Embargo" | "Notificação";
  fiscal: string;
  data: string;
  gps: string;
  relatorio: string;
  status?: "Agendada" | "Validada";
  validadaEm?: string;
  validadaPor?: string;
  conclusao?: string;
  fotos: string[];
};

export type ModeloDocumento = {
  id: string;
  nome: string;
  tipo: "Licença" | "Parecer" | "Notificação" | "Certidão" | "Autorização";
  conteudo: string;
  ativo: boolean;
};

export type Configuracao = {
  orgao: string;
  municipio: string;
  prazoAnaliseDias: number;
  alertaVencimentoDias: number;
  tamanhoMaxUploadMb: number;
  consultaPublicaAtiva: boolean;
};

export type Auditoria = {
  id: string;
  data: string;
  usuario: string;
  acao: string;
  entidade: string;
  detalhe: string;
};

export type Notificacao = {
  id: string;
  data: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  tipo: "Prazo" | "Documento" | "Sistema" | "Licença";
};

export type AppState = {
  usuarios: Usuario[];
  empreendedores: Empreendedor[];
  empreendimentos: Empreendimento[];
  atividades: Atividade[];
  processos: Processo[];
  taxas: Taxa[];
  fiscalizacoes: Fiscalizacao[];
  modelos: ModeloDocumento[];
  configuracao: Configuracao;
  auditoria: Auditoria[];
  notificacoes: Notificacao[];
};

export type ModuleKey =
  | "dashboard"
  | "processos"
  | "empreendedores"
  | "empreendimentos"
  | "atividades"
  | "taxas"
  | "fiscalizacao"
  | "usuarios"
  | "modelos"
  | "relatorios"
  | "configuracoes"
  | "consulta";
