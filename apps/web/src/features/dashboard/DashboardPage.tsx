import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, FileText, ShieldCheck } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../../app/providers";
import { PageHeader, StatusBadge } from "../../components/ui";

const colors = ["#0b6b45", "#d8aa32", "#087f8c", "#15803d", "#b42318", "#687970"];

export function DashboardPage() {
  const { state, session } = useApp();
  const counts = new Map<string, number>(); state.processos.forEach((item) => counts.set(item.status, (counts.get(item.status) ?? 0) + 1));
  const chart = [...counts].map(([name, value]) => ({ name, value }));
  const pendingDocs = state.processos.reduce((total, item) => total + item.documentos.filter((doc) => doc.status === "Pendente" || doc.status === "Enviado").length, 0);
  const issued = state.processos.filter((item) => item.licencaEmitida).length;
  const inspections = state.fiscalizacoes.filter((item) => item.status !== "Validada").length;
  const roleIntro = session?.perfil === "Empreendedor" ? "Acompanhe suas solicitações e pendências." : session?.perfil === "Fiscal" ? "Organize vistorias e ações de campo." : "Acompanhe indicadores e prioridades da operação.";
  const metrics = [
    { label: session?.perfil === "Analista" ? "Processos atribuídos" : "Total de processos", value: state.processos.length, icon: FileText },
    { label: "Aguardando documentos", value: pendingDocs, icon: ClipboardCheck },
    { label: "Licenças emitidas", value: issued, icon: CheckCircle2 },
    { label: "Fiscalizações abertas", value: inspections, icon: ShieldCheck }
  ];
  return <><PageHeader title={`Olá, ${session?.nome.split(" ")[0] ?? ""}`} description={roleIntro} />
    <section className="metrics-grid" aria-label="Indicadores">{metrics.map(({ label, value, icon: Icon }) => <article className="metric" key={label}><Icon /><div><strong>{value}</strong><span>{label}</span></div></article>)}</section>
    <section className="dashboard-grid"><article className="chart-panel"><header><div><h2>Processos por situação</h2><p>Distribuição dos processos visíveis no seu perfil.</p></div></header>{chart.length ? <div className="chart-layout"><div className="chart-box" aria-hidden="true"><ResponsiveContainer><PieChart><Pie data={chart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3}>{chart.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><ul className="chart-legend">{chart.map((item, index) => <li key={item.name}><i style={{ background: colors[index % colors.length] }} /><span>{item.name}</span><strong>{item.value}</strong></li>)}</ul></div> : <p>Sem dados para o gráfico.</p>}</article>
      <article className="priority-panel"><header><h2>Prioridades</h2><CalendarClock /></header><div className="priority-list">{state.processos.slice(0, 5).map((processo) => <a href={`/processos/${processo.id}`} key={processo.id}><div><strong>{processo.numero}</strong><span>{state.empreendimentos.find((item) => item.id === processo.empreendimentoId)?.nome ?? "Empreendimento"}</span></div><StatusBadge>{processo.status}</StatusBadge></a>)}{!state.processos.length ? <p>Nenhuma prioridade disponível.</p> : null}</div></article>
      <article className="deadline-panel"><header><h2>Prazos próximos</h2><AlertTriangle /></header>{state.processos.slice(0, 5).map((processo) => <div key={processo.id}><CalendarClock /><span><strong>{processo.prazo}</strong><small>{processo.numero}</small></span></div>)}</article>
      <article className="activity-panel"><header><h2>Atividades recentes</h2></header>{state.auditoria.slice(0, 5).map((item) => <div key={item.id}><span className="activity-dot" /><p><strong>{item.acao}</strong><br />{item.entidade}</p><time>{item.data}</time></div>)}{!state.auditoria.length ? <p>Sem atividades disponíveis para este perfil.</p> : null}</article>
    </section></>;
}
