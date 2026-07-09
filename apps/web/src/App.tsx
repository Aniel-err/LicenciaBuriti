import {
  Archive,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  Landmark,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Phone,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  Users,
  X
} from "lucide-react";
import { type ElementType, type FormEvent, useEffect, useMemo, useState } from "react";
import {
  assignProcessApi,
  createActivityApi,
  createEnterpriseApi,
  createEntrepreneurApi,
  createFeeApi,
  createInspectionApi,
  createOpinionApi,
  createProcessApi,
  createTemplateApi,
  createUserApi,
  issueLicenseApi,
  loadAppState,
  loginApi,
  mapUser,
  perfilFromRole,
  publicSearchApi,
  getUserErrorMessage,
  requestProcessDocumentApi,
  saveSettingsApi,
  sendProcessMessageApi,
  validateDocumentApi,
  validateInspectionApi,
  uploadDocumentApi
} from "./api";
import { atividadesSeed, auditoriaSeed, configuracaoSeed, empreendedoresSeed, empreendimentosSeed, fiscalizacoesSeed, modelosSeed, notificacoesSeed, processosSeed, taxasSeed, usuariosSeed } from "./data";
import type { AppState, Fiscalizacao, ModeloDocumento, ModuleKey, Notificacao, Perfil, Processo, Status, Usuario } from "./types";

type AuthSession = {
  userId: string;
  nome: string;
  email: string;
  perfil: Perfil;
  empreendedorId?: string;
  token?: string;
};

const STORAGE_KEY = "licencia-buriti-state-v2";
const SESSION_KEY = "licencia-buriti-session-v1";
const analysts = ["Aline Carvalho", "Rafael Mendes", "Juliana Pereira"];
const UNASSIGNED_ANALYST = "Aguardando distribuicao";

const initialState: AppState = {
  usuarios: usuariosSeed,
  empreendedores: empreendedoresSeed,
  empreendimentos: empreendimentosSeed,
  atividades: atividadesSeed,
  processos: processosSeed,
  taxas: taxasSeed,
  fiscalizacoes: fiscalizacoesSeed,
  modelos: modelosSeed,
  configuracao: configuracaoSeed,
  auditoria: auditoriaSeed,
  notificacoes: notificacoesSeed
};

function withDefaults(state: Partial<AppState>): AppState {
  const storedUsers = state.usuarios ?? [];
  const usuarios = [
    ...storedUsers.map((user) => {
      const seed = initialState.usuarios.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
      return { ...seed, ...user, senha: user.senha ?? seed?.senha ?? "", ultimoAcesso: user.ultimoAcesso ?? "-" } as Usuario;
    }),
    ...initialState.usuarios.filter((seed) => !storedUsers.some((user) => user.email.toLowerCase() === seed.email.toLowerCase()))
  ];

  return {
    ...initialState,
    ...state,
    usuarios,
    configuracao: { ...initialState.configuracao, ...state.configuracao }
  };
}

function field(data: Record<string, string>, key: string, fallback = "") {
  return data[key]?.trim() || fallback;
}

const menuItems: Array<{ key: ModuleKey; label: string; icon: ElementType; profiles: Perfil[] }> = [
  { key: "dashboard", label: "Dashboard", icon: Home, profiles: ["Administrador", "Analista", "Fiscal"] },
  { key: "processos", label: "Processos", icon: FileText, profiles: ["Administrador", "Analista", "Fiscal", "Empreendedor"] },
  { key: "empreendedores", label: "Empreendedores", icon: Users, profiles: ["Administrador", "Analista"] },
  { key: "empreendimentos", label: "Empreendimentos", icon: Building2, profiles: ["Administrador", "Analista", "Empreendedor"] },
  { key: "atividades", label: "Atividades", icon: ClipboardList, profiles: ["Administrador", "Analista"] },
  { key: "taxas", label: "Taxas", icon: Landmark, profiles: ["Administrador"] },
  { key: "fiscalizacao", label: "Fiscalização", icon: ShieldCheck, profiles: ["Administrador", "Fiscal", "Analista"] },
  { key: "usuarios", label: "Usuários", icon: UserCog, profiles: ["Administrador"] },
  { key: "modelos", label: "Modelos", icon: FileCheck2, profiles: ["Administrador", "Analista"] },
  { key: "relatorios", label: "Relatórios", icon: Archive, profiles: ["Administrador", "Analista"] },
  { key: "configuracoes", label: "Configurações", icon: Settings, profiles: ["Administrador"] },
  { key: "consulta", label: "Consulta Pública", icon: BookOpen, profiles: ["Administrador", "Analista", "Fiscal", "Empreendedor", "Público"] }
];

const tabs: Array<"Todos" | Status> = ["Todos", "Recebido", "Distribuído", "Em análise", "Aguardando documentos", "Vistoria agendada", "Deferido", "Licença emitida", "Indeferido"];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function todayTime() {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
}

function todayDate() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function statusClass(status: Status) {
  return {
    "Em análise": "info",
    "Aguardando documentos": "warning",
    "Vistoria agendada": "warning",
    Recebido: "neutral",
    Distribuído: "info",
    "Parecer emitido": "info",
    Deferido: "success",
    "Licença emitida": "success",
    Indeferido: "danger",
    Arquivado: "neutral"
  }[status];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function useStoredState() {
  const [state, setState] = useState<AppState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? withDefaults(JSON.parse(stored) as Partial<AppState>) : initialState;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return [state, setState] as const;
}

function useStoredSession() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession) : null;
  });

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  return [session, setSession] as const;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function analystName(name: string) {
  if (["Nao atribuido", "Não atribuído", "Não distribuído", "Nao distribuido"].includes(name)) return UNASSIGNED_ANALYST;
  return name || UNASSIGNED_ANALYST;
}

function hasTechnicalTrace(value: string) {
  return /react-dom|dispatchEvent|processDispatchQueue|api\.ts|App\.tsx|localhost:\d+|http:\/\/|https:\/\/|stack trace/i.test(value);
}

export function stateForSession(state: AppState, session: AuthSession): AppState {
  if (session.perfil === "Público") {
    return { ...state, auditoria: [], notificacoes: [] };
  }

  if (session.perfil !== "Empreendedor") return state;
  if (!session.empreendedorId) {
    return {
      ...state,
      usuarios: state.usuarios.filter((item) => item.id === session.userId),
      empreendedores: [],
      empreendimentos: [],
      processos: [],
      fiscalizacoes: [],
      auditoria: [],
      notificacoes: []
    };
  }

  const enterpriseIds = new Set(state.empreendimentos.filter((item) => item.empreendedorId === session.empreendedorId).map((item) => item.id));
  const processIds = new Set(state.processos.filter((item) => item.empreendedorId === session.empreendedorId).map((item) => item.id));

  return {
    ...state,
    usuarios: state.usuarios.filter((item) => item.id === session.userId),
    empreendedores: state.empreendedores.filter((item) => item.id === session.empreendedorId),
    empreendimentos: state.empreendimentos.filter((item) => enterpriseIds.has(item.id)),
    processos: state.processos.filter((item) => processIds.has(item.id)),
    fiscalizacoes: state.fiscalizacoes.filter((item) => processIds.has(item.processoId)),
    auditoria: state.auditoria.filter((item) => item.usuario === session.nome || [...processIds].some((id) => item.entidade.includes(id))),
    notificacoes: []
  };
}

function entityNames(state: AppState, processo: Processo) {
  const empreendedor = state.empreendedores.find((item) => item.id === processo.empreendedorId);
  const empreendimento = state.empreendimentos.find((item) => item.id === processo.empreendimentoId);
  return {
    empreendedor: empreendedor?.nome ?? "Empreendedor removido",
    documento: empreendedor?.documento ?? "-",
    telefone: empreendedor?.telefone ?? "-",
    email: empreendedor?.email ?? "-",
    empreendimento: empreendimento?.nome ?? "Empreendimento removido",
    municipio: empreendimento?.municipio ?? "Buriti - MA"
  };
}

function Sidebar({
  active,
  perfil,
  collapsed,
  onSelect,
  onToggleCollapse
}: {
  active: ModuleKey;
  perfil: Perfil;
  collapsed: boolean;
  onSelect: (key: ModuleKey) => void;
  onToggleCollapse: () => void;
}) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark">LB</div>
        <div>
          <strong>Licencia Buriti</strong>
          <span>Sistema Municipal de Licenciamento Ambiental</span>
        </div>
      </div>
      <div className="city-block">
        <div className="crest">MA</div>
        <div>
          <strong>Prefeitura Municipal de Buriti</strong>
          <span>Secretaria Municipal de Meio Ambiente e Turismo</span>
        </div>
      </div>
      <nav>
        {menuItems
          .filter((item) => item.profiles.includes(perfil))
          .map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => onSelect(item.key)}>
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
      </nav>
      <div className="sidebar-footer">
        <button className="collapse-button" type="button" aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed} onClick={onToggleCollapse}>
          <Menu size={18} />
          <span>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
        </button>
        <span>Versão 1.1.0</span>
        <span>Fluxo funcional local</span>
      </div>
    </aside>
  );
}

function LoginView({ users, onLogin, onPublic }: { users: Usuario[]; onLogin: (email: string, senha: string) => Promise<string | null>; onPublic: () => void }) {
  const [email, setEmail] = useState("admin@buriti.ma.gov.br");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demoUsers = users.filter((item) => item.ativo).slice(0, 4);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await onLogin(email, senha);
    setLoading(false);
    if (result) setError(result);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-mark">LB</div>
          <div>
            <strong>Licencia Buriti</strong>
            <span>Secretaria Municipal de Meio Ambiente e Turismo</span>
          </div>
        </div>
        <div>
          <h1>Acesso ao licenciamento ambiental</h1>
          <p>Entre com um usuario habilitado para operar processos, fiscalizacoes, cadastros e acompanhamento externo.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Senha<input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} autoComplete="current-password" required /></label>
          {error ? <div className="login-error">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}><LockKeyhole size={17} />{loading ? "Entrando..." : "Entrar no sistema"}</button>
          <button className="secondary-button" type="button" onClick={onPublic}><BookOpen size={17} />Consulta publica</button>
        </form>
      </section>
      <aside className="login-aside">
        <div>
          <ShieldCheck size={26} />
          <h2>Perfis separados</h2>
          <p>Cada login abre somente os modulos permitidos e, no perfil empreendedor, somente os proprios processos e empreendimentos.</p>
        </div>
        <div className="demo-accounts">
          <strong>Contas para teste</strong>
          {demoUsers.map((user) => (
            <button key={user.id} type="button" onClick={() => { setEmail(user.email); setSenha(""); }}>
              <span>{user.perfil}</span>
              <b>{user.email}</b>
              <small>API</small>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

function Topbar({
  active,
  session,
  search,
  setSearch,
  notificacoes,
  onReadNotifications,
  onLogout
}: {
  active: ModuleKey;
  session: AuthSession;
  search: string;
  setSearch: (value: string) => void;
  notificacoes: Notificacao[];
  onReadNotifications: () => void;
  onLogout: () => void;
}) {
  const title = menuItems.find((item) => item.key === active)?.label ?? "Dashboard";
  const [open, setOpen] = useState(false);
  const unread = notificacoes.filter((item) => !item.lida).length;
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{session.perfil === "Empreendedor" ? "Solicitação e acompanhamento de licenças" : "Gestão do licenciamento ambiental municipal"}</p>
      </div>
      <label className="search">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar processos, empreendedores, CNPJ ou Nº de processo..." />
      </label>
      <button className="icon-button" aria-label="Notificações" onClick={() => setOpen((value) => !value)}>
        <Bell size={19} />
        {unread > 0 ? <span className="dot">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel">
          <header>
            <strong>Notificações</strong>
            <button onClick={onReadNotifications}>Marcar lidas</button>
          </header>
          {notificacoes.map((item) => (
            <article key={item.id} className={item.lida ? "" : "unread"}>
              <span>{item.tipo}</span>
              <strong>{item.titulo}</strong>
              <p>{item.mensagem}</p>
              <small>{item.data}</small>
            </article>
          ))}
        </div>
      ) : null}
      <div className="session-card">
        <div className="avatar">{initials(session.nome)}</div>
        <div>
          <strong>{session.nome}</strong>
          <small>{session.perfil}</small>
        </div>
        <button className="ghost-button" aria-label="Sair" onClick={onLogout}><LogOut size={18} /></button>
      </div>
    </header>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <header>
          <h2>{title}</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, delta, tone }: { icon: ElementType; label: string; value: number; delta: string; tone: string }) {
  return (
    <section className="metric">
      <div className={`metric-icon ${tone}`}>
        <Icon size={24} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </section>
  );
}

function ProcessTable({ state, processos, selectedId, onSelect }: { state: AppState; processos: Processo[]; selectedId?: string; onSelect: (processo: Processo) => void }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Nº do processo</th>
            <th>Tipo de licença</th>
            <th>Empreendedor / empreendimento</th>
            <th>Analista responsável</th>
            <th>Prazo</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {processos.map((processo) => {
            const names = entityNames(state, processo);
            return (
              <tr key={processo.id} className={selectedId === processo.id ? "selected" : ""} onClick={() => onSelect(processo)}>
                <td data-label="Nº do processo">{processo.numero}</td>
                <td data-label="Tipo de licença">{processo.tipoLicenca}</td>
                <td data-label="Empreendedor / empreendimento">
                  <strong>{names.empreendedor}</strong>
                  <small>{names.empreendimento}</small>
                </td>
                <td data-label="Analista responsável">{analystName(processo.analista)}</td>
                <td data-label="Prazo">
                  <strong>{processo.prazo}</strong>
                </td>
                <td data-label="Situação">
                  <span className={`status ${statusClass(processo.status)}`}>{processo.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pagination">
        <span>Mostrando {processos.length} processo(s)</span>
      </div>
    </div>
  );
}

function Dashboard({ state, setActive, onSelectProcess }: { state: AppState; setActive: (key: ModuleKey) => void; onSelectProcess: (processo: Processo) => void }) {
  const metrics = {
    total: state.processos.length,
    emAnalise: state.processos.filter((item) => item.status === "Em análise").length,
    aguardando: state.processos.filter((item) => item.status === "Aguardando documentos").length,
    vencendo: state.processos.filter((item) => item.status === "Licença emitida").length
  };

  return (
    <main className="content">
      <div className="metrics-grid">
        <MetricCard icon={FileText} label="Processos recebidos" value={metrics.total} delta="Base operacional atual" tone="green" />
        <MetricCard icon={Search} label="Em análise" value={metrics.emAnalise} delta="Fila técnica da Secretaria" tone="teal" />
        <MetricCard icon={CalendarClock} label="Aguardando documentos" value={metrics.aguardando} delta="Pendências do empreendedor" tone="amber" />
        <MetricCard icon={Bell} label="Licenças emitidas" value={metrics.vencendo} delta="Com consulta pública ativa" tone="orange" />
      </div>
      <div className="flow-strip">
        {["Cadastro", "Empreendimento", "Solicitação", "Documentos", "Protocolo", "Acompanhar"].map((step) => (
          <button key={step} onClick={() => setActive(step === "Cadastro" ? "empreendedores" : step === "Empreendimento" ? "empreendimentos" : "processos")}>
            {step}
          </button>
        ))}
      </div>
      <ProcessTable state={state} processos={state.processos.slice(0, 6)} selectedId={state.processos[0]?.id} onSelect={onSelectProcess} />
    </main>
  );
}

function DetailPanel({ state, processo, perfil, actionNotice, onAction, onUpload, onValidateDocument, onSendMessage, onClose }: { state: AppState; processo: Processo; perfil: Perfil; actionNotice: string; onAction: (action: string, value?: string) => void; onUpload: (documentId: string, file: File) => void; onValidateDocument: (documentId: string, status: "VALIDADO" | "RECUSADO") => Promise<void>; onSendMessage: (content: string) => Promise<void>; onClose: () => void }) {
  const names = entityNames(state, processo);
  const pending = processo.documentos.filter((item) => item.status === "Pendente");
  const canRunInternalActions = ["Administrador", "Analista", "Fiscal"].includes(perfil);
  const [activeTab, setActiveTab] = useState<"andamento" | "documentos" | "mensagens">("andamento");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  return (
    <aside className="detail-panel">
      <div className="detail-head">
        <div>
          <h2>Processo {processo.numero}</h2>
          <span className={`status ${statusClass(processo.status)}`}>{processo.status}</span>
        </div>
        <button className="ghost-button" aria-label="Fechar painel" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div className="detail-grid">
        <div><FileText size={16} /><span>Tipo de licença</span><strong>{processo.tipoLicenca}</strong></div>
        <div><CalendarClock size={16} /><span>Data de abertura</span><strong>{processo.abertura}</strong></div>
        <div><Building2 size={16} /><span>Empreendedor</span><strong>{names.empreendedor}</strong></div>
        <div><FileCheck2 size={16} /><span>CNPJ / CPF</span><strong>{names.documento}</strong></div>
        <div><MapPin size={16} /><span>Empreendimento</span><strong>{names.empreendimento}</strong></div>
        <div><MapPin size={16} /><span>Município</span><strong>{names.municipio}</strong></div>
      </div>
      <div className="analyst">
        <div className="avatar">{initials(analystName(processo.analista))}</div>
        <div><span>Analista responsável</span><strong>{analystName(processo.analista)}</strong></div>
        <Phone size={16} /><Mail size={16} />
      </div>
      {canRunInternalActions ? (
        <div className="actions wrap">
          <button className="primary-button" data-testid="request-documents" onClick={() => onAction("complementar")}>Solicitar documentos</button>
          <button className="secondary-button" data-testid="assign-process" onClick={() => onAction("distribuir")}>Distribuir</button>
          <button className="secondary-button" data-testid="schedule-inspection" onClick={() => onAction("vistoria")}>Agendar vistoria</button>
          <button className="secondary-button" data-testid="issue-opinion" onClick={() => onAction("parecer")}>Emitir parecer</button>
          <button className="secondary-button" data-testid="issue-license" onClick={() => onAction("licenca")}>Emitir licença</button>
        </div>
      ) : null}
      {actionNotice ? <div className="panel-feedback" role="status">{actionNotice}</div> : null}
      <div className="panel-tabs">
        <button type="button" className={activeTab === "andamento" ? "is-active" : ""} onClick={() => setActiveTab("andamento")}>Andamento</button>
        <button type="button" className={activeTab === "documentos" ? "is-active" : ""} onClick={() => setActiveTab("documentos")}>Documentos ({pending.length} pendente(s))</button>
        <button type="button" className={activeTab === "mensagens" ? "is-active" : ""} onClick={() => setActiveTab("mensagens")}>Mensagens</button>
      </div>
      {activeTab === "andamento" ? (
        <ol className="timeline">
          {processo.timeline.map((item) => (
            <li key={item.id} className={item.current ? "current" : item.done ? "done" : ""}>
              <span>{item.done ? <CheckCircle2 size={16} /> : null}</span>
              <div><strong>{item.label}</strong><small>{item.date}</small></div>
              <small>{item.actor}</small>
            </li>
          ))}
        </ol>
      ) : null}
      {activeTab === "documentos" ? (
        <section className="document-list">
          {processo.documentos.map((doc) => (
            <div key={doc.id}>
              <span className={`status ${doc.status === "Pendente" ? "warning" : doc.status === "Recusado" ? "danger" : "success"}`}>{doc.status}</span>
              <strong>{doc.nome}</strong>
              <small>{doc.arquivo ?? "Nenhum arquivo enviado"}</small>
              {canRunInternalActions ? (
                <div className="document-actions">
                  <button type="button" className="secondary-button" disabled={!doc.arquivo || doc.status === "Validado"} onClick={() => onValidateDocument(doc.id, "VALIDADO")}>Validar</button>
                  <button type="button" className="danger-button" disabled={doc.status === "Recusado"} onClick={() => onValidateDocument(doc.id, "RECUSADO")}>Recusar</button>
                  {!doc.arquivo ? <small>Envie o arquivo antes de validar.</small> : null}
                </div>
              ) : null}
              <label className="file-button">
                <Upload size={15} />
                Enviar PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(doc.id, file);
                  }}
                />
              </label>
            </div>
          ))}
        </section>
      ) : null}
      {activeTab === "mensagens" ? (
        <section className="message-list">
          {processo.mensagens.length > 0 ? processo.mensagens.map((message) => (
            <div key={message.id}>
              <strong>{message.autor}</strong>
              <p>{message.texto}</p>
              <small>{message.data}</small>
            </div>
          )) : <div className="empty-state compact">Nenhuma mensagem registrada neste processo.</div>}
          <form className="message-form" onSubmit={async (event) => {
            event.preventDefault();
            const content = messageDraft.trim();
            if (content.length < 3) {
              setMessageError("Escreva uma mensagem com pelo menos 3 caracteres.");
              return;
            }
            try {
              setSendingMessage(true);
              setMessageError("");
              await onSendMessage(content);
              setMessageDraft("");
            } catch (caughtError) {
              setMessageError(getUserErrorMessage(caughtError, "Nao foi possivel enviar a mensagem."));
            } finally {
              setSendingMessage(false);
            }
          }}>
            <label>Nova mensagem
              <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Escreva uma mensagem para os envolvidos no processo" />
            </label>
            {messageError ? <div className="form-error" role="alert">{messageError}</div> : null}
            <button className="primary-button" type="submit" disabled={sendingMessage}>{sendingMessage ? "Enviando..." : "Enviar mensagem"}</button>
          </form>
        </section>
      ) : null}
      {processo.licencaEmitida ? (
        <div className="deadline">
          <span>Licença emitida</span>
          <strong>{processo.licencaEmitida.numero} - validade {processo.licencaEmitida.validade}</strong>
          <button className="secondary-button" data-testid="download-license" onClick={() => onAction("download")}>Baixar comprovante</button>
        </div>
      ) : null}
    </aside>
  );
}

function ProcessesPage({ state, setState, search, selected, setSelected, perfil, session, onRefresh, onError }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; search: string; selected?: Processo; setSelected: (processo?: Processo) => void; perfil: Perfil; session: AuthSession; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  const [status, setStatus] = useState<"Todos" | Status>("Todos");
  const [modal, setModal] = useState<"novo" | "pendencia" | "parecer" | "distribuir" | "vistoria" | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const filtered = state.processos.filter((processo) => {
    const names = entityNames(state, processo);
    const matchesStatus = status === "Todos" || processo.status === status;
    const q = `${processo.numero} ${processo.protocolo} ${processo.tipoLicenca} ${names.empreendedor} ${names.documento} ${names.empreendimento}`.toLowerCase();
    return matchesStatus && q.includes(search.toLowerCase());
  });
  const firstFilteredId = filtered[0]?.id;

  useEffect(() => {
    if (!selected && !panelDismissed && firstFilteredId) {
      setSelected(filtered[0]);
    }
  }, [filtered, firstFilteredId, panelDismissed, selected, setSelected]);

  function updateProcess(id: string, updater: (processo: Processo) => Processo) {
    const currentSelected = selected?.id === id ? selected : state.processos.find((item) => item.id === id);
    if (currentSelected) setSelected(updater(currentSelected));
    setState((current) => ({
      ...current,
      processos: current.processos.map((processo) => (processo.id === id ? updater(processo) : processo))
    }));
  }

  function appendAudit(action: string, entity: string, detail: string) {
    setState((current) => ({
      ...current,
      auditoria: [{ id: uid("aud"), data: todayTime(), usuario: perfil, acao: action, entidade: entity, detalhe: detail }, ...current.auditoria],
      notificacoes: [{ id: uid("not"), data: todayTime(), titulo: action, mensagem: detail, tipo: action.includes("LICEN") ? "Licença" : action.includes("DOC") ? "Documento" : "Sistema", lida: false }, ...current.notificacoes]
    }));
  }

  function addHistory(processo: Processo, statusValue: Status, label: string, actor = perfil) {
    return {
      ...processo,
      status: statusValue,
      timeline: processo.timeline.map((item) => ({ ...item, current: false })).concat({
        id: uid("tl"),
        label,
        actor,
        date: todayTime(),
        done: true,
        current: true
      })
    };
  }

  async function handleAction(action: string, value?: string) {
    if (!selected) return;
    setActionNotice("");
    if (action === "distribuir") {
      setActionNotice("Escolha o analista responsavel antes de distribuir o processo.");
      setModal("distribuir");
      return;
    }
    if (action === "vistoria") {
      setActionNotice("Preencha os dados da vistoria para registrar a fiscalizacao.");
      setModal("vistoria");
      return;
    }
    if (action === "complementar") {
      setActionNotice("Preencha a pendencia para solicitar os documentos ao empreendedor.");
      setModal("pendencia");
      return;
    }
    if (action === "parecer") {
      setActionNotice("Preencha o parecer tecnico para registrar a decisao no processo.");
      setModal("parecer");
      return;
    }
    if (action === "download") {
      const blob = new Blob([`Licença ${selected.licencaEmitida?.numero}\nProcesso ${selected.numero}\nValidade ${selected.licencaEmitida?.validade}`], { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `licenca-${selected.numero}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
      setActionNotice("Comprovante gerado para download.");
      return;
    }
    if (session.token) {
      try {
        let successMessage = "Acao registrada no processo.";
        if (action === "distribuir") {
          const analystId = perfil === "Administrador" ? state.usuarios.find((user) => user.perfil === "Analista" && user.ativo)?.id : undefined;
          if (perfil === "Administrador" && !analystId) throw new Error("Cadastre ou ative um analista antes de distribuir o processo.");
          await assignProcessApi(session.token, selected.id, analystId);
          successMessage = "Processo distribuido ao analista responsavel.";
        }
        if (action === "vistoria") {
          await sendProcessMessageApi(session.token, selected.id, "Vistoria solicitada pela equipe interna.");
          successMessage = "Solicitacao de vistoria registrada no processo.";
        }
        if (action === "licenca") {
          const blob = await issueLicenseApi(session.token, selected.id);
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `licenca-${selected.numero}.pdf`;
          link.click();
          URL.revokeObjectURL(link.href);
          successMessage = "Licenca emitida e download iniciado.";
        }
        await onRefresh();
        onError("");
        setActionNotice(successMessage);
        return;
      } catch (error) {
        const message = getUserErrorMessage(error);
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        setActionNotice("");
        onError(message);
        return;
      }
    }
    appendAudit(action.toUpperCase(), `Processo ${selected.numero}`, value ?? "Tramitação atualizada");
    let successMessage = "Acao registrada no processo.";
    if (action === "distribuir") successMessage = "Processo distribuido ao analista responsavel.";
    if (action === "vistoria") successMessage = "Vistoria agendada e registrada no andamento.";
    if (action === "licenca") successMessage = "Licenca emitida e registrada no processo.";
    updateProcess(selected.id, (processo) => {
      if (action === "distribuir") return addHistory({ ...processo, analista: analysts[(state.processos.length + 1) % analysts.length] ?? "Aline Carvalho" }, "Distribuído", "Processo distribuído ao analista");
      if (action === "vistoria") return addHistory(processo, "Vistoria agendada", "Vistoria agendada pela fiscalização");
      if (action === "licenca") {
        const issued = addHistory(processo, "Licença emitida", "Licença ambiental emitida");
        return { ...issued, licencaEmitida: { numero: `LIC-${new Date().getFullYear()}-${processo.numero.split(".").at(-1)}`, data: todayDate(), validade: addDays(365) } };
      }
      return value ? addHistory(processo, "Aguardando documentos", value) : processo;
    });
    setActionNotice(successMessage);
  }

  async function uploadDocument(documentId: string, file: File) {
    if (!selected) return;
    if (session.token) {
      try {
        await uploadDocumentApi(session.token, documentId, file);
        await onRefresh();
        return;
      } catch (error) {
        const message = getUserErrorMessage(error, "Nao foi possivel enviar o documento.");
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        onError(message);
        return;
      }
    }
    updateProcess(selected.id, (processo) => ({
      ...addHistory(processo, processo.status === "Aguardando documentos" ? "Em análise" : processo.status, `Documento enviado: ${file.name}`, "Empreendedor"),
      documentos: processo.documentos.map((doc) => (doc.id === documentId ? { ...doc, status: "Enviado", arquivo: file.name } : doc))
    }));
    appendAudit("DOCUMENTO", `Processo ${selected.numero}`, `Upload de documento: ${file.name}`);
  }

  async function validateDocument(documentId: string, status: "VALIDADO" | "RECUSADO") {
    if (!selected) return;
    const nextStatus = status === "VALIDADO" ? "Validado" : "Recusado";
    if (session.token) {
      try {
        await validateDocumentApi(session.token, documentId, status);
        await onRefresh();
        onError("");
        setActionNotice(status === "VALIDADO" ? "Documento validado com sucesso." : "Documento recusado. Solicite a correcao ao empreendedor.");
        return;
      } catch (error) {
        const message = getUserErrorMessage(error, "Nao foi possivel atualizar o documento.");
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        setActionNotice("");
        onError(message);
        throw error;
      }
    }

    updateProcess(selected.id, (processo) => addHistory({
      ...processo,
      documentos: processo.documentos.map((doc) => (doc.id === documentId ? { ...doc, status: nextStatus } : doc))
    }, processo.status, `Documento marcado como ${nextStatus}.`));
    appendAudit("DOCUMENTO", `Processo ${selected.numero}`, `Documento marcado como ${nextStatus}.`);
    setActionNotice(status === "VALIDADO" ? "Documento validado com sucesso." : "Documento recusado. Solicite a correcao ao empreendedor.");
  }

  async function scheduleInspection(data: Record<string, string>, fiscalId: string) {
    if (!selected) return;
    if (session.token) {
      try {
        await createInspectionApi(session.token, data, selected.id, fiscalId);
        await onRefresh();
        onError("");
        setActionNotice("Vistoria registrada e vinculada ao processo.");
        setModal(null);
        return;
      } catch (error) {
        const message = getUserErrorMessage(error, "Nao foi possivel agendar a vistoria.");
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        setActionNotice("");
        onError(message);
        throw error;
      }
    }

    const fiscal = state.usuarios.find((user) => user.id === fiscalId);
    updateProcess(selected.id, (processo) => addHistory(processo, "Vistoria agendada", "Vistoria agendada pela fiscalizacao"));
    setState((current) => ({
      ...current,
      fiscalizacoes: [{
        id: uid("fis"),
        processoId: selected.id,
        tipo: field(data, "tipo", "Vistoria") as Fiscalizacao["tipo"],
        fiscal: fiscal?.nome ?? "Fiscal nao informado",
        data: field(data, "data"),
        gps: field(data, "gps"),
        relatorio: field(data, "relatorio"),
        fotos: []
      }, ...current.fiscalizacoes]
    }));
    appendAudit("VISTORIA", `Processo ${selected.numero}`, "Vistoria agendada pela fiscalizacao.");
    setActionNotice("Vistoria registrada e vinculada ao processo.");
    setModal(null);
  }

  async function sendMessage(content: string) {
    if (!selected) return;
    if (session.token) {
      try {
        await sendProcessMessageApi(session.token, selected.id, content);
        await onRefresh();
        onError("");
        setActionNotice("Mensagem enviada aos envolvidos no processo.");
        return;
      } catch (error) {
        const message = getUserErrorMessage(error, "Nao foi possivel enviar a mensagem.");
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        setActionNotice("");
        onError(message);
        throw error;
      }
    }

    updateProcess(selected.id, (processo) => ({
      ...processo,
      mensagens: processo.mensagens.concat({ id: uid("msg"), autor: session.nome, texto: content, data: todayTime() })
    }));
    appendAudit("MENSAGEM", `Processo ${selected.numero}`, "Mensagem enviada no processo.");
    setActionNotice("Mensagem enviada aos envolvidos no processo.");
  }

  async function distributeProcess(analystId: string) {
    if (!selected) return;
    const analyst = state.usuarios.find((user) => user.id === analystId && user.perfil === "Analista" && user.ativo);
    if (!analyst) throw new Error("Escolha um analista ativo para distribuir o processo.");

    if (session.token) {
      try {
        await assignProcessApi(session.token, selected.id, analyst.id);
        await onRefresh();
        onError("");
        setActionNotice(`Processo distribuido para ${analyst.nome}.`);
        setModal(null);
        return;
      } catch (error) {
        const message = getUserErrorMessage(error);
        appendAudit("ERRO", `Processo ${selected.numero}`, message);
        setActionNotice("");
        onError(message);
        throw error;
      }
    }

    appendAudit("DISTRIBUIR", `Processo ${selected.numero}`, `Processo distribuido para ${analyst.nome}.`);
    updateProcess(selected.id, (processo) => addHistory({ ...processo, analista: analyst.nome }, "Distribuído", `Processo distribuido para ${analyst.nome}.`));
    setActionNotice(`Processo distribuido para ${analyst.nome}.`);
    setModal(null);
  }

  return (
    <>
      <main className="content">
        <div className="table-toolbar detached">
          <div className="tabs">
            {tabs.map((tab) => (
              <button key={tab} className={status === tab ? "is-active" : ""} onClick={() => setStatus(tab)}>{tab}</button>
            ))}
          </div>
          <button className="primary-button" onClick={() => setModal("novo")}><Plus size={17} />Nova solicitação</button>
        </div>
        <ProcessTable
          state={state}
          processos={filtered}
          selectedId={selected?.id}
          onSelect={(processo) => {
            setPanelDismissed(false);
            setSelected(processo);
          }}
        />
      </main>
      {selected ? <DetailPanel state={state} processo={selected} perfil={perfil} actionNotice={actionNotice} onAction={handleAction} onUpload={uploadDocument} onValidateDocument={validateDocument} onSendMessage={sendMessage} onClose={() => { setPanelDismissed(true); setSelected(undefined); }} /> : null}
      {modal === "novo" ? <NewProcessModal state={state} setState={setState} onSelect={setSelected} onClose={() => setModal(null)} session={session} onRefresh={onRefresh} /> : null}
      {modal === "distribuir" && selected ? <AssignAnalystModal analysts={state.usuarios.filter((user) => user.perfil === "Analista" && user.ativo)} currentAnalyst={analystName(selected.analista)} onClose={() => setModal(null)} onSave={distributeProcess} /> : null}
      {modal === "vistoria" && selected ? <ScheduleInspectionModal fiscais={state.usuarios.filter((user) => user.perfil === "Fiscal" && user.ativo)} onClose={() => setModal(null)} onSave={scheduleInspection} /> : null}
      {modal === "pendencia" && selected ? <TextActionModal title="Solicitar complementação" label="Documento ou pendência" onClose={() => setModal(null)} onSave={async (text) => { if (session.token) { await requestProcessDocumentApi(session.token, selected.id, text); await onRefresh(); } else { updateProcess(selected.id, (p) => ({ ...addHistory(p, "Aguardando documentos", `Complementação solicitada: ${text}`), documentos: p.documentos.concat({ id: uid("doc"), nome: text, obrigatorio: true, status: "Pendente" }) })); } setModal(null); }} /> : null}
      {modal === "parecer" && selected ? <TextActionModal title="Emitir parecer técnico" label="Conclusão do parecer" onClose={() => setModal(null)} onSave={async (text) => { if (session.token) { await createOpinionApi(session.token, selected.id, text); await onRefresh(); } else { updateProcess(selected.id, (p) => ({ ...addHistory(p, "Parecer emitido", "Parecer técnico emitido"), parecer: text })); } setModal(null); }} /> : null}
    </>
  );
}

function NewProcessModal({ state, setState, onSelect, onClose, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onSelect: (processo: Processo) => void; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [enterpriseId, setEnterpriseId] = useState(state.empreendimentos[0]?.id ?? "");
  const enterprise = state.empreendimentos.find((item) => item.id === enterpriseId);
  const activity = state.atividades.find((item) => item.id === enterprise?.atividadeId);
  const [license, setLicense] = useState(activity?.licencas[0] ?? "LI");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLicense(activity?.licencas[0] ?? "LI");
  }, [activity?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!enterprise || !activity) return;
    try {
      setSaving(true);
      setError("");
    if (session.token) {
      await createProcessApi(session.token, enterprise, license);
      await onRefresh();
      onClose();
      return;
    }
    const year = new Date().getFullYear();
    const sequence = String(state.processos.length + 1).padStart(6, "0");
    const processo: Processo = {
      id: uid("proc"),
      numero: `${year}.${sequence}`,
      protocolo: `BURITI-${year}-${sequence}`,
      tipoLicenca: license,
      empreendedorId: enterprise.empreendedorId,
      empreendimentoId: enterprise.id,
      analista: UNASSIGNED_ANALYST,
      prazo: addDays(30),
      status: "Recebido",
      abertura: todayDate(),
      condicionantes: [],
      documentos: activity.documentos.map((nome) => ({ id: uid("doc"), nome, obrigatorio: true, status: "Pendente" })),
      mensagens: [],
      timeline: [{ id: uid("tl"), label: "Processo recebido e protocolo gerado", actor: "Sistema", date: todayTime(), done: true, current: true }]
    };
    setState((current) => ({ ...current, processos: [processo, ...current.processos] }));
    onSelect(processo);
    onClose();
    } catch (caughtError) {
      setError(getUserErrorMessage(caughtError, "Nao foi possivel gerar o protocolo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nova solicitação de licenciamento" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label>Empreendimento<select value={enterpriseId} onChange={(e) => setEnterpriseId(e.target.value)}>{state.empreendimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label>Tipo de ato<select value={license} onChange={(e) => setLicense(e.target.value)}>{(activity?.licencas ?? ["LI"]).map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="form-note">
          <strong>Documentos exigidos dinamicamente</strong>
          <span>{activity?.documentos.join(", ")}</span>
        </div>
        {error ? <div className="form-error span-2" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Gerando..." : "Gerar protocolo"}</button>
      </form>
    </Modal>
  );
}

function AssignAnalystModal({ analysts, currentAnalyst, onSave, onClose }: { analysts: Usuario[]; currentAnalyst: string; onSave: (analystId: string) => void | Promise<void>; onClose: () => void }) {
  const current = analysts.find((analyst) => analyst.nome === currentAnalyst);
  const [analystId, setAnalystId] = useState(current?.id ?? analysts[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Distribuir processo" onClose={onClose}>
      <form className="form-grid" onSubmit={async (event) => {
        event.preventDefault();
        if (!analystId) {
          setError("Escolha um analista ativo para distribuir o processo.");
          return;
        }
        try {
          setSaving(true);
          setError("");
          await onSave(analystId);
        } catch (caughtError) {
          setError(getUserErrorMessage(caughtError, "Nao foi possivel distribuir o processo."));
        } finally {
          setSaving(false);
        }
      }}>
        <label className="span-2">Analista responsavel
          <select value={analystId} onChange={(event) => setAnalystId(event.target.value)} disabled={analysts.length === 0} required>
            {analysts.map((analyst) => <option key={analyst.id} value={analyst.id}>{analyst.nome}</option>)}
          </select>
        </label>
        <div className="form-note">
          <strong>Responsavel atual</strong>
          <span>{currentAnalyst}</span>
        </div>
        {error ? <div className="form-error span-2" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={saving || analysts.length === 0}>{saving ? "Distribuindo..." : "Confirmar distribuicao"}</button>
      </form>
    </Modal>
  );
}

function ScheduleInspectionModal({ fiscais, onSave, onClose }: { fiscais: Usuario[]; onSave: (data: Record<string, string>, fiscalId: string) => void | Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({ tipo: "Vistoria" });
  const [fiscalId, setFiscalId] = useState(fiscais[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Agendar vistoria" onClose={onClose}>
      <form className="form-grid" onSubmit={async (event) => {
        event.preventDefault();
        if (!fiscalId) {
          setError("Escolha um fiscal ativo para a vistoria.");
          return;
        }
        if (hasTechnicalTrace(values.relatorio ?? "")) {
          setError("O relatorio deve descrever a vistoria. Remova textos tecnicos ou mensagens copiadas do navegador.");
          return;
        }
        try {
          setSaving(true);
          setError("");
          await onSave(values, fiscalId);
        } catch (caughtError) {
          setError(getUserErrorMessage(caughtError, "Nao foi possivel agendar a vistoria."));
        } finally {
          setSaving(false);
        }
      }}>
        <label>Fiscal responsavel
          <select value={fiscalId} onChange={(event) => setFiscalId(event.target.value)} disabled={fiscais.length === 0} required>
            {fiscais.map((fiscal) => <option key={fiscal.id} value={fiscal.id}>{fiscal.nome}</option>)}
          </select>
        </label>
        <label>Tipo
          <select value={values.tipo ?? "Vistoria"} onChange={(event) => setValues((current) => ({ ...current, tipo: event.target.value }))}>
            <option>Vistoria</option>
            <option>Notificacao</option>
            <option>Auto de infracao</option>
            <option>Embargo</option>
          </select>
        </label>
        <label>Data<input type="datetime-local" value={values.data ?? ""} onChange={(event) => setValues((current) => ({ ...current, data: event.target.value }))} /></label>
        <label>GPS<input value={values.gps ?? ""} onChange={(event) => setValues((current) => ({ ...current, gps: event.target.value }))} placeholder="-3.95, -43.07" /></label>
        <label className="span-2">Relatorio ou orientacao da vistoria<textarea value={values.relatorio ?? ""} onChange={(event) => setValues((current) => ({ ...current, relatorio: event.target.value }))} placeholder="Descreva o objetivo da vistoria, pontos a verificar e orientacoes ao fiscal." required /></label>
        {error ? <div className="form-error span-2" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={saving || fiscais.length === 0}>{saving ? "Agendando..." : "Confirmar vistoria"}</button>
      </form>
    </Modal>
  );
}

function TextActionModal({ title, label, onSave, onClose }: { title: string; label: string; onSave: (value: string) => void | Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form-grid" onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim()) return;
        try {
          setSaving(true);
          setError("");
          await onSave(value.trim());
        } catch (caughtError) {
          setError(getUserErrorMessage(caughtError));
        } finally {
          setSaving(false);
        }
      }}>
        <label className="span-2">{label}<textarea value={value} onChange={(event) => setValue(event.target.value)} required /></label>
        {error ? <div className="form-error span-2" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar no processo"}</button>
      </form>
    </Modal>
  );
}

function RegistryPage({ state, setState, type, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; type: ModuleKey; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (type === "empreendedores") {
    return <CrudList title="Empreendedores" action="Novo empreendedor" columns={["Nome", "Tipo", "CPF/CNPJ", "Contato"]} rows={state.empreendedores.map((item) => ({ id: item.id, cells: [item.nome, item.tipo, item.documento, item.email] }))} onAdd={() => setOpen(true)} onDelete={(id) => setState((s) => ({ ...s, empreendedores: s.empreendedores.filter((item) => item.id !== id) }))}>{open ? <EntrepreneurModal setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}</CrudList>;
  }
  if (type === "empreendimentos") {
    return <CrudList title="Empreendimentos" action="Novo empreendimento" columns={["Nome", "Empreendedor", "Atividade", "Classificação"]} rows={state.empreendimentos.map((item) => ({ id: item.id, cells: [item.nome, state.empreendedores.find((emp) => emp.id === item.empreendedorId)?.nome ?? "-", state.atividades.find((ativ) => ativ.id === item.atividadeId)?.descricao ?? "-", item.classificacao] }))} onAdd={() => setOpen(true)} onDelete={(id) => setState((s) => ({ ...s, empreendimentos: s.empreendimentos.filter((item) => item.id !== id) }))}>{open ? <EnterpriseModal state={state} setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}</CrudList>;
  }
  if (type === "atividades") {
    return <CrudList title="Cadastro de Atividades" action="Nova atividade" columns={["Código", "Descrição", "Porte", "Potencial", "Licenças", "Documentos"]} rows={state.atividades.map((item) => ({ id: item.id, cells: [item.codigo, item.descricao, item.porte, item.potencial, item.licencas.join(", "), String(item.documentos.length)] }))} onAdd={() => setOpen(true)} onDelete={(id) => setState((s) => ({ ...s, atividades: s.atividades.filter((item) => item.id !== id) }))}>{open ? <ActivityModal setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}</CrudList>;
  }
  return <CrudList title="Cadastro de Taxas" action="Nova taxa" columns={["Atividade", "Licença", "Porte", "Valor"]} rows={state.taxas.map((item) => ({ id: item.id, cells: [state.atividades.find((ativ) => ativ.id === item.atividadeId)?.descricao ?? "-", item.licenca, item.porte, formatCurrency(item.valor)] }))} onAdd={() => setOpen(true)} onDelete={(id) => setState((s) => ({ ...s, taxas: s.taxas.filter((item) => item.id !== id) }))}>{open ? <FeeModal state={state} setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}</CrudList>;
}

function CrudList({ title, action, columns, rows, onAdd, onDelete, children }: { title: string; action: string; columns: string[]; rows: Array<{ id: string; cells: string[] }>; onAdd: () => void; onDelete: (id: string) => void; children?: React.ReactNode }) {
  return (
    <main className="module-page">
      <div className="page-header"><div><h2>{title}</h2><p>Registros alteram o fluxo de licenciamento imediatamente.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} />{action}</button></div>
      <ActionTable columns={columns} rows={rows} onDelete={onDelete} />
      {children}
    </main>
  );
}

function ActionTable({ columns, rows, onDelete }: { columns: string[]; rows: Array<{ id: string; cells: string[] }>; onDelete: (id: string) => void }) {
  return (
    <div className="table-shell">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th>Ações</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => <td key={`${row.id}-${columns[index]}`} data-label={columns[index]}>{cell}</td>)}
              <td data-label="Ações"><button className="danger-button" onClick={() => onDelete(row.id)}><Trash2 size={15} />Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntrepreneurModal({ setState, onClose, session, onRefresh }: { setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  return <GenericForm title="Novo empreendedor" fields={["nome", "documento", "responsavelLegal", "telefone", "email", "endereco"]} onClose={onClose} onSave={async (data) => { if (session.token) { await createEntrepreneurApi(session.token, data); await onRefresh(); } else setState((s) => ({ ...s, empreendedores: [{ id: uid("emp"), tipo: "PJ", nome: field(data, "nome"), documento: field(data, "documento"), responsavelLegal: field(data, "responsavelLegal"), telefone: field(data, "telefone"), email: field(data, "email"), endereco: field(data, "endereco") }, ...s.empreendedores] })); }} />;
}

function EnterpriseModal({ state, setState, onClose, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [empreendedorId, setEmpreendedorId] = useState(state.empreendedores[0]?.id ?? "");
  const [atividadeId, setAtividadeId] = useState(state.atividades[0]?.id ?? "");
  return (
    <Modal title="Novo empreendimento" onClose={onClose}>
      <GenericFields fields={["nome", "endereco", "latitude", "longitude", "area"]} onSubmit={async (data) => { const atividade = state.atividades.find((a) => a.id === atividadeId); if (session.token) { await createEnterpriseApi(session.token, data, empreendedorId, atividadeId, atividade); await onRefresh(); } else setState((s) => ({ ...s, empreendimentos: [{ id: uid("end"), empreendedorId, atividadeId, nome: field(data, "nome"), endereco: field(data, "endereco"), municipio: "Buriti - MA", latitude: field(data, "latitude"), longitude: field(data, "longitude"), area: field(data, "area"), porte: atividade?.porte ?? "Médio", potencial: atividade?.potencial ?? "Médio", classificacao: "Urbano" }, ...s.empreendimentos] })); onClose(); }}>
        <label>Empreendedor<select value={empreendedorId} onChange={(e) => setEmpreendedorId(e.target.value)}>{state.empreendedores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label>Atividade<select value={atividadeId} onChange={(e) => setAtividadeId(e.target.value)}>{state.atividades.map((item) => <option key={item.id} value={item.id}>{item.codigo} - {item.descricao}</option>)}</select></label>
      </GenericFields>
    </Modal>
  );
}

function ActivityModal({ setState, onClose, session, onRefresh }: { setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  return <GenericForm title="Nova atividade" fields={["codigo", "descricao", "porte", "potencial", "licencas", "documentos"]} onClose={onClose} onSave={async (data) => { if (session.token) { await createActivityApi(session.token, data); await onRefresh(); } else setState((s) => ({ ...s, atividades: [{ id: uid("ativ"), codigo: field(data, "codigo"), descricao: field(data, "descricao"), porte: field(data, "porte", "Médio"), potencial: field(data, "potencial", "Médio"), licencas: field(data, "licencas", "LI").split(",").map((x) => x.trim()).filter(Boolean), documentos: field(data, "documentos", "Requerimento").split("\n").map((x) => x.trim()).filter(Boolean) }, ...s.atividades] })); }} />;
}

function FeeModal({ state, setState, onClose, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [atividadeId, setAtividadeId] = useState(state.atividades[0]?.id ?? "");
  return (
    <Modal title="Nova taxa" onClose={onClose}>
      <GenericFields fields={["licenca", "porte", "valor"]} onSubmit={async (data) => { if (session.token) { await createFeeApi(session.token, data, atividadeId); await onRefresh(); } else setState((s) => ({ ...s, taxas: [{ id: uid("taxa"), atividadeId, licenca: field(data, "licenca", "LI"), porte: field(data, "porte", "Médio"), valor: Number(field(data, "valor", "0").replace(",", ".")) || 0 }, ...s.taxas] })); onClose(); }}>
        <label>Atividade<select value={atividadeId} onChange={(e) => setAtividadeId(e.target.value)}>{state.atividades.map((item) => <option key={item.id} value={item.id}>{item.descricao}</option>)}</select></label>
      </GenericFields>
    </Modal>
  );
}

function GenericForm({ title, fields, onSave, onClose }: { title: string; fields: string[]; onSave: (data: Record<string, string>) => void | Promise<void>; onClose: () => void }) {
  return <Modal title={title} onClose={onClose}><GenericFields fields={fields} onSubmit={async (data) => { await onSave(data); onClose(); }} /></Modal>;
}

function GenericFields({ fields, children, onSubmit }: { fields: string[]; children?: React.ReactNode; onSubmit: (data: Record<string, string>) => void | Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form className="form-grid" onSubmit={async (event) => {
      event.preventDefault();
      try {
        setSaving(true);
        setError("");
        await onSubmit(values);
      } catch (caughtError) {
        setError(getUserErrorMessage(caughtError));
      } finally {
        setSaving(false);
      }
    }}>
      {children}
      {fields.map((field) => (
        <label key={field} className={field === "documentos" ? "span-2" : ""}>{field}<textarea hidden={field !== "documentos"} value={values[field] ?? ""} onChange={(event) => setValues((v) => ({ ...v, [field]: event.target.value }))} required={field !== "telefone"} />{field !== "documentos" ? <input type={field === "senha" ? "password" : "text"} value={values[field] ?? ""} onChange={(event) => setValues((v) => ({ ...v, [field]: event.target.value }))} required={field !== "telefone"} /> : null}</label>
      ))}
      {error ? <div className="form-error span-2" role="alert">{error}</div> : null}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

function InspectionPage({ state, setState, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <main className="module-page">
      <div className="page-header"><div><h2>Fiscalização</h2><p>Agenda de vistorias, notificações e registros de campo.</p></div><button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} />Nova ação</button></div>
      <SimpleTable columns={["Processo", "Tipo", "Fiscal", "Data", "GPS", "Relatório"]} rows={state.fiscalizacoes.map((item) => [state.processos.find((p) => p.id === item.processoId)?.numero ?? "-", item.tipo, item.fiscal, item.data, item.gps, item.relatorio])} />
      {open ? <InspectionModal state={state} setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}
    </main>
  );
}

function UsersPage({ state, setState, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <main className="module-page">
      <div className="page-header"><div><h2>Usuários e permissões</h2><p>Controle de acesso por perfil validado no fluxo operacional.</p></div><button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} />Novo usuário</button></div>
      <ActionTable
        columns={["Nome", "E-mail", "Perfil", "Status", "Último acesso"]}
        rows={state.usuarios.map((item) => ({ id: item.id, cells: [item.nome, item.email, item.perfil, item.ativo ? "Ativo" : "Inativo", item.ultimoAcesso] }))}
        onDelete={(id) => setState((s) => ({ ...s, usuarios: s.usuarios.filter((item) => item.id !== id) }))}
      />
      {open ? <UserModal state={state} setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}
    </main>
  );
}

function UserModal({ state, setState, onClose, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [perfil, setPerfil] = useState<Usuario["perfil"]>("Analista");
  const [empreendedorId, setEmpreendedorId] = useState(state.empreendedores[0]?.id ?? "");
  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <GenericFields fields={["nome", "email", "telefone", "senha"]} onSubmit={async (data) => { if (session.token) { await createUserApi(session.token, data, perfil); await onRefresh(); } else setState((s) => ({ ...s, usuarios: [{ id: uid("usr"), nome: field(data, "nome"), email: field(data, "email"), senha: field(data, "senha"), telefone: field(data, "telefone"), perfil, ativo: true, ultimoAcesso: "-", empreendedorId: perfil === "Empreendedor" ? empreendedorId : undefined }, ...s.usuarios] })); onClose(); }}>
        <label>Perfil<select value={perfil} onChange={(e) => setPerfil(e.target.value as Usuario["perfil"])}><option>Administrador</option><option>Analista</option><option>Fiscal</option><option>Empreendedor</option></select></label>
        {perfil === "Empreendedor" ? <label>Empreendedor<select value={empreendedorId} onChange={(e) => setEmpreendedorId(e.target.value)}>{state.empreendedores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label> : null}
      </GenericFields>
    </Modal>
  );
}

function ModelsPage({ state, setState, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <main className="module-page">
      <div className="page-header"><div><h2>Modelos oficiais</h2><p>Textos usados para licenças, pareceres, notificações e certidões.</p></div><button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} />Novo modelo</button></div>
      <ActionTable
        columns={["Nome", "Tipo", "Status", "Conteúdo"]}
        rows={state.modelos.map((item) => ({ id: item.id, cells: [item.nome, item.tipo, item.ativo ? "Ativo" : "Inativo", item.conteudo.slice(0, 90)] }))}
        onDelete={(id) => setState((s) => ({ ...s, modelos: s.modelos.filter((item) => item.id !== id) }))}
      />
      {open ? <ModelModal setState={setState} onClose={() => setOpen(false)} session={session} onRefresh={onRefresh} /> : null}
    </main>
  );
}

function ModelModal({ setState, onClose, session, onRefresh }: { setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [tipo, setTipo] = useState<ModeloDocumento["tipo"]>("Licença");
  return (
    <Modal title="Novo modelo oficial" onClose={onClose}>
      <GenericFields fields={["nome", "conteudo"]} onSubmit={async (data) => { if (session.token) { await createTemplateApi(session.token, data, tipo); await onRefresh(); } else setState((s) => ({ ...s, modelos: [{ id: uid("mod"), nome: field(data, "nome"), tipo, conteudo: field(data, "conteudo"), ativo: true }, ...s.modelos] })); onClose(); }}>
        <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value as ModeloDocumento["tipo"])}><option>Licença</option><option>Parecer</option><option>Notificação</option><option>Certidão</option><option>Autorização</option></select></label>
      </GenericFields>
    </Modal>
  );
}

function SettingsPage({ state, setState, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [draft, setDraft] = useState(state.configuracao);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <main className="module-page narrow">
      <div className="page-header"><div><h2>Configurações do sistema</h2><p>Parâmetros operacionais usados pelos fluxos de protocolo, prazos, upload e consulta pública.</p></div></div>
      <form className="settings-panel" onSubmit={async (event) => {
        event.preventDefault();
        try {
          setSaving(true);
          setError("");
          if (session.token) {
            await saveSettingsApi(session.token, draft);
            await onRefresh();
          } else {
            setState((s) => ({ ...s, configuracao: draft, auditoria: [{ id: uid("aud"), data: todayTime(), usuario: "Administrador", acao: "CONFIGURAÇÃO", entidade: "Sistema", detalhe: "Parâmetros atualizados" }, ...s.auditoria] }));
          }
        } catch (caughtError) {
          setError(getUserErrorMessage(caughtError, "Nao foi possivel salvar as configuracoes."));
        } finally {
          setSaving(false);
        }
      }}>
        <label>Órgão<input value={draft.orgao} onChange={(e) => setDraft({ ...draft, orgao: e.target.value })} /></label>
        <label>Município<input value={draft.municipio} onChange={(e) => setDraft({ ...draft, municipio: e.target.value })} /></label>
        <label>Prazo de análise (dias)<input type="number" value={draft.prazoAnaliseDias} onChange={(e) => setDraft({ ...draft, prazoAnaliseDias: Number(e.target.value) })} /></label>
        <label>Alerta de vencimento (dias)<input type="number" value={draft.alertaVencimentoDias} onChange={(e) => setDraft({ ...draft, alertaVencimentoDias: Number(e.target.value) })} /></label>
        <label>Tamanho máximo de upload (MB)<input type="number" value={draft.tamanhoMaxUploadMb} onChange={(e) => setDraft({ ...draft, tamanhoMaxUploadMb: Number(e.target.value) })} /></label>
        <label className="check-row"><input type="checkbox" checked={draft.consultaPublicaAtiva} onChange={(e) => setDraft({ ...draft, consultaPublicaAtiva: e.target.checked })} />Consulta pública ativa</label>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={saving}><Save size={17} />{saving ? "Salvando..." : "Salvar configurações"}</button>
      </form>
    </main>
  );
}

function InspectionModal({ state, setState, onClose, session, onRefresh }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; session: AuthSession; onRefresh: () => Promise<void> }) {
  const [processoId, setProcessoId] = useState(state.processos[0]?.id ?? "");
  const fiscalId = state.usuarios.find((item) => item.perfil === "Fiscal" && item.ativo)?.id;
  return (
    <Modal title="Registrar fiscalização" onClose={onClose}>
      <GenericFields fields={["tipo", "fiscal", "data", "gps", "relatorio"]} onSubmit={async (data) => { if (session.token) { await createInspectionApi(session.token, data, processoId, fiscalId); await onRefresh(); } else setState((s) => ({ ...s, fiscalizacoes: [{ id: uid("fis"), processoId, tipo: field(data, "tipo", "Vistoria") as Fiscalizacao["tipo"], fiscal: field(data, "fiscal"), data: field(data, "data"), gps: field(data, "gps"), relatorio: field(data, "relatorio"), fotos: [] }, ...s.fiscalizacoes] })); onClose(); }}>
        <label>Processo<select value={processoId} onChange={(e) => setProcessoId(e.target.value)}>{state.processos.map((item) => <option key={item.id} value={item.id}>{item.numero}</option>)}</select></label>
      </GenericFields>
    </Modal>
  );
}

function ReportsPage({ state }: { state: AppState }) {
  const byStatus = tabs.filter((tab) => tab !== "Todos").map((tab) => [tab, state.processos.filter((p) => p.status === tab).length]);
  function exportCsv() {
    const rows = [["Processo", "Tipo", "Status", "Analista", "Prazo"], ...state.processos.map((p) => [p.numero, p.tipoLicenca, p.status, analystName(p.analista), p.prazo])];
    const blob = new Blob([rows.map((row) => row.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "relatorio-processos.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return (
    <main className="module-page">
      <div className="page-header"><div><h2>Relatórios gerenciais</h2><p>Indicadores filtráveis por situação, licença e responsável.</p></div><button className="primary-button" onClick={exportCsv}><Download size={17} />Exportar CSV</button></div>
      <div className="workflow-grid">
        {byStatus.map(([label, value]) => <section key={label}><Gauge size={22} /><h3>{label}</h3><p>{value} processo(s)</p></section>)}
      </div>
      <div className="section-title">
        <h3>Auditoria recente</h3>
        <p>Registro local das ações administrativas executadas no sistema.</p>
      </div>
      <SimpleTable columns={["Data", "Usuário", "Ação", "Entidade", "Detalhe"]} rows={state.auditoria.slice(0, 12).map((item) => [item.data, item.usuario, item.acao, item.entidade, item.detalhe])} />
    </main>
  );
}

function PublicSearch({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [apiRows, setApiRows] = useState<string[][]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    publicSearchApi(query)
      .then((results) => {
        if (!cancelled) {
          setError("");
          setApiRows(results.map((item) => [item.number, item.enterprise, item.licenseType, item.status, item.validUntil ? new Intl.DateTimeFormat("pt-BR").format(new Date(item.validUntil)) : "-"]));
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setApiRows([]);
          setError(getUserErrorMessage(caughtError, "Nao foi possivel carregar a consulta publica."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query]);
  return (
    <main className="module-page public-page">
      <div className="page-header"><div><h2>Consulta Pública</h2><p>Busca por número do processo, CPF, CNPJ ou empreendimento.</p></div></div>
      {state.configuracao.consultaPublicaAtiva ? (
        <>
          <div className="public-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Informe número do processo, CPF, CNPJ ou empreendimento" /></div>
          {error && query.trim().length >= 5 ? <div className="form-error" role="alert">{error}</div> : null}
          <SimpleTable columns={["Processo", "Empreendimento", "Tipo", "Situação", "Validade"]} rows={query.trim().length >= 5 ? apiRows : []} />
        </>
      ) : (
        <div className="empty-state">A consulta pública está temporariamente desativada nas configurações do sistema.</div>
      )}
    </main>
  );
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="table-shell">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={`${row.join("-")}-${rowIndex}`}>{row.map((cell, index) => <td key={`${columns[index]}-${cell}`} data-label={columns[index]}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function AppErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="app-error" role="alert">
      <span>{message}</span>
      <button type="button" className="icon-button" aria-label="Fechar aviso" onClick={onClose}><X size={16} /></button>
    </div>
  );
}

export function App() {
  const [state, setState] = useStoredState();
  const [session, setSession] = useStoredSession();
  const [active, setActive] = useState<ModuleKey>("processos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Processo | undefined>(state.processos[0]);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [appError, setAppError] = useState("");
  const visibleState = useMemo(() => (session ? stateForSession(state, session) : state), [state, session]);
  async function refreshFromApi() {
    if (!session?.token) return;
    try {
      const nextState = await loadAppState(session.token, session.perfil, state);
      setState(nextState);
      setAppError("");
    } catch (error) {
      const message = getUserErrorMessage(error, "Nao foi possivel atualizar os dados do sistema.");
      setAppError(message);
      throw error;
    }
  }

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    loadAppState(session.token, session.perfil, state)
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch((error) => {
        if (!cancelled) setAppError(getUserErrorMessage(error, "Nao foi possivel carregar os dados do sistema."));
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);
  const perfil = session?.perfil ?? "Público";

  useEffect(() => {
    if (!session) return;
    const allowed = menuItems.find((item) => item.key === active)?.profiles.includes(perfil);
    if (!allowed) setActive(perfil === "Público" ? "consulta" : "dashboard");
  }, [active, perfil, session]);

  useEffect(() => {
    if (!session || active !== "processos") return;
    if (selected && !visibleState.processos.some((item) => item.id === selected.id)) {
      setSelected(visibleState.processos[0]);
    }
  }, [active, selected, session, visibleState.processos]);

  useEffect(() => {
    if (!session || session.userId === "public" || session.token) return;
    const user = state.usuarios.find((item) => item.id === session.userId && item.ativo);
    if (!user) setSession(null);
  }, [session, state.usuarios, setSession]);

  async function handleLogin(email: string, senha: string) {
    try {
      const login = await loginApi(email, senha);
      const acesso = todayTime();
      const perfil = perfilFromRole(login.user.role);
      const nextSession: AuthSession = {
        userId: login.user.id,
        nome: login.user.name,
        email: login.user.email,
        perfil,
        empreendedorId: login.user.entrepreneurId ?? undefined,
        token: login.token
      };
      const apiUser = mapUser(login.user);

      setState((current) => ({
        ...current,
        usuarios: current.usuarios.some((item) => item.email.toLowerCase() === login.user.email.toLowerCase())
          ? current.usuarios.map((item) => (item.email.toLowerCase() === login.user.email.toLowerCase() ? { ...item, ...apiUser, ultimoAcesso: acesso } : item))
          : [{ ...apiUser, ultimoAcesso: acesso }, ...current.usuarios],
        auditoria: [{ id: uid("aud"), data: acesso, usuario: login.user.name, acao: "LOGIN", entidade: "Sessão", detalhe: `Acesso via API como ${perfil}` }, ...current.auditoria]
      }));
      setSession(nextSession);
      setAppError("");
      setActive(perfil === "Empreendedor" ? "processos" : "dashboard");
      setSelected(undefined);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Nao foi possivel autenticar na API.";
    }
  }

  function handlePublicAccess() {
    setSession({ userId: "public", nome: "Consulta pública", email: "publico@local", perfil: "Público" });
    setActive("consulta");
    setSelected(undefined);
  }

  if (!session) {
    return <LoginView users={state.usuarios} onLogin={handleLogin} onPublic={handlePublicAccess} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={active}
        perfil={perfil}
        collapsed={menuCollapsed}
        onSelect={setActive}
        onToggleCollapse={() => setMenuCollapsed((value) => !value)}
      />
      <section className="main-shell">
        <Topbar
          active={active}
          session={session}
          search={search}
          setSearch={setSearch}
          notificacoes={visibleState.notificacoes}
          onReadNotifications={() => setState((s) => ({ ...s, notificacoes: s.notificacoes.map((item) => ({ ...item, lida: true })) }))}
          onLogout={() => { setSession(null); setSearch(""); setSelected(undefined); }}
        />
        <AppErrorBanner message={appError} onClose={() => setAppError("")} />
        <div className="workspace">
          {active === "dashboard" ? <Dashboard state={visibleState} setActive={setActive} onSelectProcess={(processo) => { setSelected(processo); setActive("processos"); }} /> : null}
          {active === "processos" ? <ProcessesPage state={visibleState} setState={setState} search={search} selected={selected} setSelected={setSelected} perfil={perfil} session={session} onRefresh={refreshFromApi} onError={setAppError} /> : null}
          {["empreendedores", "empreendimentos", "atividades", "taxas"].includes(active) ? <RegistryPage state={visibleState} setState={setState} type={active} session={session} onRefresh={refreshFromApi} /> : null}
          {active === "fiscalizacao" ? <InspectionPage state={visibleState} setState={setState} session={session} onRefresh={refreshFromApi} /> : null}
          {active === "usuarios" ? <UsersPage state={visibleState} setState={setState} session={session} onRefresh={refreshFromApi} /> : null}
          {active === "modelos" ? <ModelsPage state={visibleState} setState={setState} session={session} onRefresh={refreshFromApi} /> : null}
          {active === "relatorios" ? <ReportsPage state={visibleState} /> : null}
          {active === "configuracoes" ? <SettingsPage state={visibleState} setState={setState} session={session} onRefresh={refreshFromApi} /> : null}
          {active === "consulta" ? <PublicSearch state={state} /> : null}
        </div>
      </section>
    </div>
  );
}
