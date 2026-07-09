import type { Atividade, Auditoria, Configuracao, Empreendedor, Empreendimento, Fiscalizacao, ModeloDocumento, Notificacao, Processo, Taxa, Usuario } from "./types";

export const usuariosSeed: Usuario[] = [
  { id: "usr-1", nome: "Aline Carvalho", email: "admin@buriti.ma.gov.br", senha: "", perfil: "Administrador", telefone: "(98) 98100-1100", ativo: true, ultimoAcesso: "01/07/2026 08:20" },
  { id: "usr-2", nome: "Rafael Mendes", email: "analista@buriti.ma.gov.br", senha: "", perfil: "Analista", telefone: "(98) 98421-1234", ativo: true, ultimoAcesso: "30/06/2026 17:42" },
  { id: "usr-3", nome: "Juliana Pereira", email: "fiscal@buriti.ma.gov.br", senha: "", perfil: "Fiscal", telefone: "(98) 98210-3300", ativo: true, ultimoAcesso: "30/06/2026 15:10" },
  { id: "usr-4", nome: "Marcos Vinícius Sousa", email: "empreendedor@empresa.com", senha: "", perfil: "Empreendedor", telefone: "(98) 98421-1234", ativo: true, ultimoAcesso: "-", empreendedorId: "emp-2" }
];

export const atividadesSeed: Atividade[] = [
  {
    id: "ativ-1",
    codigo: "41.20-4",
    descricao: "Construção de edifícios e loteamentos urbanos",
    porte: "Médio",
    potencial: "Médio",
    licencas: ["LI", "LO"],
    documentos: ["Requerimento", "CNPJ ou CPF", "Contrato social", "Projeto ambiental", "ART", "Planta e memorial descritivo"]
  },
  {
    id: "ativ-2",
    codigo: "47.31-8",
    descricao: "Comércio varejista de combustíveis",
    porte: "Médio",
    potencial: "Alto",
    licencas: ["LP", "LI", "LO"],
    documentos: ["Requerimento", "CNPJ", "Contrato social", "ART", "Plano de controle ambiental", "Certidão de uso do solo", "Projeto de prevenção contra incêndio", "Matrícula do imóvel"]
  },
  {
    id: "ativ-3",
    codigo: "02.20-9",
    descricao: "Produção florestal e serrarias",
    porte: "Variável",
    potencial: "Médio",
    licencas: ["LUA", "LUAR", "ReLUA"],
    documentos: ["Requerimento", "CPF ou CNPJ", "CAR", "ART", "Projeto ambiental", "Documento de posse", "Memorial descritivo"]
  }
];

export const empreendedoresSeed: Empreendedor[] = [
  {
    id: "emp-1",
    tipo: "PJ",
    nome: "Buriti Mineração LTDA",
    documento: "09.830.456/0001-41",
    responsavelLegal: "Paulo Andrade",
    telefone: "(98) 98111-3300",
    email: "ambiental@minaburiti.com.br",
    endereco: "Rodovia MA-034, zona rural, Buriti - MA"
  },
  {
    id: "emp-2",
    tipo: "PJ",
    nome: "Construtora São Bento LTDA",
    documento: "12.345.678/0001-90",
    responsavelLegal: "Marcos Vinícius Sousa",
    telefone: "(98) 98421-1234",
    email: "contato@saobento.com.br",
    endereco: "Avenida Central, 1200, Buriti - MA"
  },
  {
    id: "emp-3",
    tipo: "PJ",
    nome: "Posto Buriti Combustíveis LTDA",
    documento: "21.665.902/0001-02",
    responsavelLegal: "Carla Nascimento",
    telefone: "(98) 98200-7788",
    email: "licenciamento@postoburiti.com.br",
    endereco: "Avenida Principal, 450, Buriti - MA"
  }
];

export const empreendimentosSeed: Empreendimento[] = [
  {
    id: "end-1",
    empreendedorId: "emp-1",
    nome: "Mina Buriti",
    endereco: "MA-034, km 12",
    municipio: "Buriti - MA",
    latitude: "-3.9451",
    longitude: "-42.9312",
    atividadeId: "ativ-3",
    area: "85 ha",
    porte: "Grande",
    potencial: "Alto",
    classificacao: "Rural"
  },
  {
    id: "end-2",
    empreendedorId: "emp-2",
    nome: "Loteamento Jardim das Águas",
    endereco: "MA-034, km 4",
    municipio: "Buriti - MA",
    latitude: "-3.9412",
    longitude: "-42.9231",
    atividadeId: "ativ-1",
    area: "18,5 ha",
    porte: "Médio",
    potencial: "Médio",
    classificacao: "Urbano"
  },
  {
    id: "end-3",
    empreendedorId: "emp-3",
    nome: "Posto Buriti",
    endereco: "Avenida Principal, 450",
    municipio: "Buriti - MA",
    latitude: "-3.9470",
    longitude: "-42.9204",
    atividadeId: "ativ-2",
    area: "0,8 ha",
    porte: "Médio",
    potencial: "Alto",
    classificacao: "Urbano"
  }
];

export const processosSeed: Processo[] = [
  {
    id: "proc-1",
    numero: "2025.000123",
    protocolo: "BURITI-2025-000123",
    tipoLicenca: "LUA",
    empreendedorId: "emp-1",
    empreendimentoId: "end-1",
    analista: "Aline Carvalho",
    prazo: "20/06/2025",
    status: "Em análise",
    abertura: "12/05/2025",
    condicionantes: [],
    documentos: [
      { id: "doc-1", nome: "Requerimento", obrigatorio: true, status: "Validado", arquivo: "requerimento.pdf" },
      { id: "doc-2", nome: "CNPJ ou CPF", obrigatorio: true, status: "Validado", arquivo: "cnpj.pdf" },
      { id: "doc-3", nome: "CAR", obrigatorio: true, status: "Enviado", arquivo: "car.pdf" },
      { id: "doc-4", nome: "Memorial descritivo atualizado", obrigatorio: true, status: "Pendente" }
    ],
    mensagens: [{ id: "msg-1", autor: "Aline Carvalho", texto: "Enviar memorial descritivo atualizado.", data: "14/05/2025 15:02" }],
    timeline: [
      { id: "tl-1", label: "Processo recebido", date: "12/05/2025 08:12", actor: "Sistema", done: true },
      { id: "tl-2", label: "Distribuído para análise", date: "13/05/2025 10:40", actor: "Aline Carvalho", done: true },
      { id: "tl-3", label: "Em análise técnica", date: "14/05/2025 14:05", actor: "Aline Carvalho", done: true, current: true }
    ]
  },
  {
    id: "proc-2",
    numero: "2025.000124",
    protocolo: "BURITI-2025-000124",
    tipoLicenca: "LI",
    empreendedorId: "emp-2",
    empreendimentoId: "end-2",
    analista: "Rafael Mendes",
    prazo: "10/06/2025",
    status: "Aguardando documentos",
    abertura: "16/05/2025",
    condicionantes: [],
    documentos: [
      { id: "doc-5", nome: "Requerimento", obrigatorio: true, status: "Validado", arquivo: "requerimento.pdf" },
      { id: "doc-6", nome: "CNPJ ou CPF", obrigatorio: true, status: "Validado", arquivo: "cnpj.pdf" },
      { id: "doc-7", nome: "Contrato social", obrigatorio: true, status: "Validado", arquivo: "contrato-social.pdf" },
      { id: "doc-8", nome: "ART", obrigatorio: true, status: "Pendente" },
      { id: "doc-9", nome: "Projeto ambiental", obrigatorio: true, status: "Pendente" },
      { id: "doc-10", nome: "Planta e memorial descritivo", obrigatorio: true, status: "Pendente" }
    ],
    mensagens: [{ id: "msg-2", autor: "Rafael Mendes", texto: "Favor anexar ART e projeto ambiental atualizado.", data: "20/05/2025 14:35" }],
    timeline: [
      { id: "tl-4", label: "Processo recebido", date: "16/05/2025 09:14", actor: "Sistema", done: true },
      { id: "tl-5", label: "Dados básicos conferidos", date: "16/05/2025 10:02", actor: "Rafael Mendes", done: true },
      { id: "tl-6", label: "Aguardando documentos do empreendedor", date: "20/05/2025 14:35", actor: "Rafael Mendes", done: true, current: true }
    ]
  },
  {
    id: "proc-3",
    numero: "2025.000125",
    protocolo: "BURITI-2025-000125",
    tipoLicenca: "LO",
    empreendedorId: "emp-3",
    empreendimentoId: "end-3",
    analista: "Juliana Pereira",
    prazo: "18/06/2025",
    status: "Em análise",
    abertura: "18/05/2025",
    condicionantes: [],
    documentos: [
      { id: "doc-11", nome: "Requerimento", obrigatorio: true, status: "Validado", arquivo: "requerimento.pdf" },
      { id: "doc-12", nome: "Plano de controle ambiental", obrigatorio: true, status: "Enviado", arquivo: "pca.pdf" },
      { id: "doc-13", nome: "Certidão de uso do solo", obrigatorio: true, status: "Pendente" }
    ],
    mensagens: [],
    timeline: [
      { id: "tl-7", label: "Processo recebido", date: "18/05/2025 11:22", actor: "Sistema", done: true },
      { id: "tl-8", label: "Em análise técnica", date: "19/05/2025 09:00", actor: "Juliana Pereira", done: true, current: true }
    ]
  }
];

export const taxasSeed: Taxa[] = [
  { id: "taxa-1", atividadeId: "ativ-1", licenca: "LI", porte: "Médio", valor: 1450 },
  { id: "taxa-2", atividadeId: "ativ-2", licenca: "LO", porte: "Médio", valor: 2280 },
  { id: "taxa-3", atividadeId: "ativ-3", licenca: "LUA", porte: "Grande", valor: 3900 }
];

export const fiscalizacoesSeed: Fiscalizacao[] = [
  {
    id: "fis-1",
    processoId: "proc-2",
    tipo: "Vistoria",
    fiscal: "Juliana Pereira",
    data: "05/06/2025",
    gps: "-3.9412, -42.9231",
    relatorio: "Vistoria inicial agendada para verificação da área diretamente afetada.",
    fotos: []
  }
];

export const modelosSeed: ModeloDocumento[] = [
  {
    id: "mod-1",
    nome: "Licença Ambiental Municipal",
    tipo: "Licença",
    ativo: true,
    conteudo: "Concede-se a licença ambiental ao empreendimento {{empreendimento}}, processo {{processo}}, observadas as condicionantes anexas."
  },
  {
    id: "mod-2",
    nome: "Parecer Técnico",
    tipo: "Parecer",
    ativo: true,
    conteudo: "Após análise dos documentos apresentados, conclui-se pelo {{resultado}} do pedido, conforme fundamentos técnicos registrados."
  },
  {
    id: "mod-3",
    nome: "Notificação de Complementação",
    tipo: "Notificação",
    ativo: true,
    conteudo: "Notifica-se o empreendedor para apresentar a documentação complementar indicada no prazo regulamentar."
  }
];

export const configuracaoSeed: Configuracao = {
  orgao: "Secretaria Municipal de Meio Ambiente e Turismo",
  municipio: "Buriti - MA",
  prazoAnaliseDias: 30,
  alertaVencimentoDias: 45,
  tamanhoMaxUploadMb: 10,
  consultaPublicaAtiva: true
};

export const auditoriaSeed: Auditoria[] = [
  { id: "aud-1", data: "01/07/2026 08:20", usuario: "Aline Carvalho", acao: "LOGIN", entidade: "Sessão", detalhe: "Acesso administrativo ao sistema" },
  { id: "aud-2", data: "30/06/2026 17:35", usuario: "Rafael Mendes", acao: "ANÁLISE", entidade: "Processo 2025.000124", detalhe: "Solicitou complementação documental" }
];

export const notificacoesSeed: Notificacao[] = [
  { id: "not-1", data: "01/07/2026 08:00", titulo: "Pendência documental", mensagem: "3 processos aguardam resposta do empreendedor.", lida: false, tipo: "Documento" },
  { id: "not-2", data: "01/07/2026 08:05", titulo: "Prazo de análise", mensagem: "1 processo vence nos próximos 5 dias.", lida: false, tipo: "Prazo" },
  { id: "not-3", data: "30/06/2026 16:40", titulo: "Backup concluído", mensagem: "Rotina de backup registrada com sucesso.", lida: true, tipo: "Sistema" }
];
