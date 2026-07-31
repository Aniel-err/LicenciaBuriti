import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getDashboardApi, getUserErrorMessage, type DashboardData } from "../../api";
import { useApp } from "../../app/providers";
import { Button, PageHeader, Skeleton, StatusBadge } from "../../components/ui";

const colors = ["#0b6b45", "#d8aa32", "#087f8c", "#15803d", "#b42318", "#687970"];
const statusNames: Record<string, string> = {
  RECEBIDO: "Recebido",
  DISTRIBUIDO: "Distribuído",
  EM_ANALISE: "Em análise",
  AGUARDANDO_DOCUMENTOS: "Aguardando documentos",
  VISTORIA_AGENDADA: "Vistoria agendada",
  PARECER_EMITIDO: "Parecer emitido",
  DEFERIDO: "Deferido",
  INDEFERIDO: "Indeferido",
  LICENCA_EMITIDA: "Licença emitida",
  ARQUIVADO: "Arquivado"
};

export function DashboardPage() {
  const { state, session } = useApp();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!session) return;
    let active = true;
    setDashboardError("");
    void getDashboardApi(session.token)
      .then((data) => { if (active) setDashboard(data); })
      .catch((cause) => { if (active) setDashboardError(getUserErrorMessage(cause, "Não foi possível carregar os indicadores.")); });
    return () => { active = false; };
  }, [session?.token, state.processos.length, state.fiscalizacoes.length, reload]);
  if (!session) return null;
  const roleIntro = session.perfil === "Empreendedor"
    ? "Acompanhe suas solicitações, documentos e prazos de renovação."
    : session.perfil === "Fiscal"
      ? "Organize vistorias e ações de campo sob sua responsabilidade."
      : "Acompanhe indicadores, responsáveis e prioridades da operação.";
  if (!dashboard) return <><PageHeader title={`Olá, ${session.nome.split(" ")[0] ?? ""}`} description={roleIntro} />{dashboardError ? <div className="field-error" role="alert">{dashboardError}<br /><Button variant="secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw />Tentar novamente</Button></div> : <Skeleton rows={7} />}</>;

  const chart = dashboard.groups.status.map((item) => ({ name: statusNames[item.name] ?? item.name, value: item.count }));
  const inspections = state.fiscalizacoes.filter((item) => item.status !== "Validada").length;
  const metrics = [
    { label: session.perfil === "Analista" ? "Processos atribuídos" : "Total de processos", value: dashboard.metrics.total, icon: FileText },
    { label: "Aguardando documentos", value: dashboard.metrics.aguardando, icon: ClipboardCheck },
    { label: "Documentos emitidos", value: dashboard.metrics.emitidas, icon: CheckCircle2 },
    { label: "Licenças vencendo", value: dashboard.metrics.vencendo, icon: AlertTriangle },
    { label: "Licenças vencidas", value: dashboard.metrics.vencidas, icon: CalendarClock },
    { label: "Fiscalizações abertas", value: inspections, icon: ShieldCheck }
  ];
  return <><PageHeader title={`Olá, ${session.nome.split(" ")[0] ?? ""}`} description={roleIntro} />
    {dashboardError ? <div className="field-error" role="alert">{dashboardError} <Button variant="secondary" onClick={() => setReload((value) => value + 1)}><RefreshCw />Tentar novamente</Button></div> : null}
    <section className="metrics-grid" aria-label="Indicadores">{metrics.map(({ label, value, icon: Icon }) => <article className="metric" key={label}><Icon /><div><strong>{value}</strong><span>{label}</span></div></article>)}</section>
    <section className="dashboard-grid">
      <article className="chart-panel"><header><div><h2>Processos por situação</h2><p>Distribuição dos processos visíveis no seu perfil.</p></div></header>{chart.length ? <div className="chart-layout"><div className="chart-box" aria-hidden="true"><ResponsiveContainer><PieChart><Pie data={chart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3}>{chart.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><ul className="chart-legend">{chart.map((item, index) => <li key={item.name}><i style={{ background: colors[index % colors.length] }} /><span>{item.name}</span><strong>{item.value}</strong></li>)}</ul></div> : <p>Sem dados para o gráfico.</p>}</article>
      <article className="priority-panel"><header><h2>Prioridades</h2><CalendarClock /></header><div className="priority-list">{dashboard.processos.slice(0, 6).map((processo) => <a href={`/processos/${processo.id}`} key={processo.id}><div><strong>{processo.number}</strong><span>{processo.enterprise?.name ?? "Empreendimento"}</span></div><StatusBadge>{statusNames[processo.status] ?? processo.status}</StatusBadge></a>)}{!dashboard.processos.length ? <p>Nenhuma prioridade disponível.</p> : null}</div></article>
      <article className="deadline-panel"><header><h2>Condicionantes próximas</h2><AlertTriangle /></header>{dashboard.deadlines.map((item) => <a href={`/processos/${item.process.id}`} key={item.id}><CalendarClock /><span><strong>{new Date(item.dueDate).toLocaleDateString("pt-BR")}</strong><small>{item.process.number} · {item.description}</small></span></a>)}{!dashboard.deadlines.length ? <p>Nenhuma condicionante vencendo nos próximos 30 dias.</p> : null}</article>
      <article className="management-panel"><header><h2>Visão por analista</h2></header><ul className="ranking-list">{dashboard.groups.analyst.map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.count}</strong></li>)}</ul></article>
      <article className="management-panel"><header><h2>Visão por atividade</h2></header><ul className="ranking-list">{dashboard.groups.activity.slice(0, 7).map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.count}</strong></li>)}</ul></article>
      <article className="management-panel"><header><h2>Processos por período</h2></header><ul className="ranking-list">{dashboard.groups.month.slice(-8).reverse().map((item) => <li key={item.name}><span>{item.name.split("-").reverse().join("/")}</span><strong>{item.count}</strong></li>)}</ul></article>
      <article className="activity-panel"><header><h2>Atividades recentes</h2></header>{state.auditoria.slice(0, 5).map((item) => <div key={item.id}><span className="activity-dot" /><p><strong>{item.acao}</strong><br />{item.entidade}</p><time>{item.data}</time></div>)}{!state.auditoria.length ? <p>Sem atividades disponíveis para este perfil.</p> : null}</article>
    </section></>;
}
