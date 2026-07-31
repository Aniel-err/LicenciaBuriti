import { Archive, Bell, Building2, ChevronLeft, FileCheck2, FileText, Gauge, Landmark, LogOut, Menu, Settings, ShieldCheck, UserCog, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ElementType } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getUserErrorMessage, markAllNotificationsReadApi, markNotificationReadApi } from "../api";
import { useApp } from "../app/providers";
import { routeMeta } from "../app/routes";
import { Brand } from "../components/Brand";
import { canAccess } from "../security/access";

const groups: Array<{ label: string; items: Array<{ key: string; label: string; icon: ElementType }> }> = [
  { label: "Visão geral", items: [{ key: "dashboard", label: "Painel", icon: Gauge }] },
  { label: "Operação", items: [{ key: "processos", label: "Processos", icon: FileText }, { key: "fiscalizacao", label: "Fiscalização", icon: ShieldCheck }] },
  { label: "Cadastros", items: [{ key: "empreendedores", label: "Empreendedores", icon: Users }, { key: "responsaveis", label: "Responsáveis técnicos", icon: UserCog }, { key: "empreendimentos", label: "Empreendimentos", icon: Building2 }, { key: "atividades", label: "Atividades", icon: Archive }, { key: "taxas", label: "Taxas", icon: Landmark }] },
  { label: "Administração", items: [{ key: "usuarios", label: "Usuários", icon: UserCog }, { key: "modelos", label: "Modelos de documentos", icon: FileCheck2 }, { key: "conteudos", label: "Conteúdo público", icon: FileText }, { key: "relatorios", label: "Relatórios", icon: Archive }, { key: "configuracoes", label: "Configurações", icon: Settings }] }
];

export function AppLayout() {
  const { session, state, logout, error, clearError, refresh, notice, notify, clearNotice } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const key = location.pathname.split("/")[1] || "dashboard";
  const meta = routeMeta[key] ?? { title: "Licencia Buriti", section: "Sistema" };
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const openNotification = async (id: string, processId?: string) => {
    if (!session) return;
    try {
      await markNotificationReadApi(session.token, id);
      await refresh();
      setNotificationsOpen(false);
      if (processId) navigate(`/processos/${processId}`);
    } catch (cause) {
      notify(getUserErrorMessage(cause, "Não foi possível abrir a notificação."), "error");
    }
  };
  const markAllRead = async () => {
    if (!session) return;
    try {
      await markAllNotificationsReadApi(session.token);
      await refresh();
      notify("Todas as notificações foram marcadas como lidas.");
    } catch (cause) {
      notify(getUserErrorMessage(cause, "Não foi possível atualizar as notificações."), "error");
    }
  };
  if (!session) return null;
  return <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
    {mobileOpen ? <button className="nav-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} /> : null}
    <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Navegação principal">
      <div className="sidebar__top"><Brand compact={collapsed} /><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <nav>{groups.map((group) => {
        const items = group.items.filter((item) => canAccess(session.perfil, item.key));
        return items.length ? <section key={group.label}><h2>{group.label}</h2>{items.map(({ key: itemKey, label, icon: Icon }) => <NavLink key={itemKey} to={`/${itemKey}`} title={collapsed ? label : undefined}><Icon size={20} /><span>{label}</span></NavLink>)}</section> : null;
      })}</nav>
      <footer><span>Beta 0.2</span><button onClick={() => setCollapsed((value) => !value)}><ChevronLeft /><span>Recolher menu</span></button></footer>
    </aside>
    <main className="main-shell">
      <header className="topbar">
        <button className="menu-button icon-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></button>
        <div className="breadcrumbs"><small>{meta.section}</small><strong>{meta.title}</strong></div>
        <div className="topbar__actions">
          <div className="notification-center" ref={notificationsRef}>
            <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-expanded={notificationsOpen} aria-label={`${state.notificacoes.filter((item) => !item.lida).length} notificações`}>
              <Bell />{state.notificacoes.some((item) => !item.lida) ? <i>{state.notificacoes.filter((item) => !item.lida).length}</i> : null}
            </button>
            {notificationsOpen ? <section className="notification-popover" aria-label="Central de notificações">
              <header><div><strong>Notificações</strong><small>Prazos e movimentações importantes</small></div>{state.notificacoes.some((item) => !item.lida) ? <button onClick={() => void markAllRead()}>Marcar todas como lidas</button> : null}</header>
              <div>{state.notificacoes.slice(0, 20).map((item) => <button className={item.lida ? "" : "is-unread"} key={item.id} onClick={() => void openNotification(item.id, item.processoId)}>
                <span><strong>{item.titulo}</strong><small>{item.mensagem}</small></span><time>{item.vencimento ?? item.data}</time>
              </button>)}{!state.notificacoes.length ? <p>Nenhum alerta no momento.</p> : null}</div>
            </section> : null}
          </div>
          <span className="avatar" aria-hidden="true">{session.nome.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="user-copy"><strong>{session.nome}</strong><small>{session.perfil}</small></div><button className="icon-button" onClick={logout} aria-label="Sair"><LogOut /></button>
        </div>
      </header>
      {error ? <div className="app-alert" role="alert"><span>{error}</span><button onClick={clearError} aria-label="Fechar aviso"><X /></button></div> : null}
      {notice ? <div className={`app-alert app-alert--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}><span>{notice.message}</span><button onClick={clearNotice} aria-label="Fechar mensagem"><X /></button></div> : null}
      <div className="page"><Outlet /></div>
    </main>
  </div>;
}
