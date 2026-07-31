import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, FileCheck2, FilePlus2, FilterX, MapPin, Plus, Printer, RefreshCw, Upload, XCircle } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  assignProcessApi,
  createConditionApi,
  createOpinionApi,
  createProcessApi,
  downloadDocumentApi,
  downloadInspectionAttachmentApi,
  downloadIssuedDocumentApi,
  getUserErrorMessage,
  issueOfficialDocumentApi,
  renewProcessApi,
  requestProcessDocumentApi,
  sendProcessMessageApi,
  updateConditionApi,
  updateProcessStatusApi,
  uploadDocumentApi,
  validateDocumentApi
} from "../../api";
import { useApp } from "../../app/providers";
import { Button, EmptyState, Modal, PageHeader, SearchField, Skeleton, StatusBadge } from "../../components/ui";
import type { Processo, Status } from "../../types";
import { saveBlob } from "../../utils/download";

export function ProcessesPage() {
  const { state, session, loading } = useApp();
  const { processId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [license, setLicense] = useState("Todos");
  const [sort, setSort] = useState("recentes");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [wizard, setWizard] = useState(false);
  const allowedCreate = session?.perfil === "Administrador" || session?.perfil === "Analista" || session?.perfil === "Empreendedor";
  const rows = useMemo(() => state.processos.filter((item) => {
    const enterprise = state.empreendimentos.find((entry) => entry.id === item.empreendimentoId)?.nome ?? "";
    return (!query || `${item.numero} ${item.protocolo} ${enterprise}`.toLowerCase().includes(query.toLowerCase()))
      && (status === "Todos" || item.status === status)
      && (license === "Todos" || item.tipoLicenca === license);
  }).sort((a, b) => sort === "numero" ? a.numero.localeCompare(b.numero) : b.abertura.localeCompare(a.abertura)), [state, query, status, license, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const visible = rows.slice((page - 1) * perPage, page * perPage);
  const selected = state.processos.find((item) => item.id === processId);

  return <>
    <PageHeader title="Processos" description="Pesquise, filtre e acompanhe solicitações de licenciamento." actions={allowedCreate ? <Button onClick={() => setWizard(true)}><Plus />Nova solicitação</Button> : null} />
    <section className="filter-bar">
      <SearchField value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Buscar processo, protocolo ou empreendimento" />
      <label>Situação<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>Todos</option>{[...new Set(state.processos.map((item) => item.status))].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Tipo<select value={license} onChange={(event) => setLicense(event.target.value)}><option>Todos</option>{[...new Set(state.processos.map((item) => item.tipoLicenca))].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Ordenar<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recentes">Mais recentes</option><option value="numero">Número</option></select></label>
      <button className="button button--ghost" onClick={() => { setQuery(""); setStatus("Todos"); setLicense("Todos"); }}><FilterX />Limpar</button>
    </section>
    <div className="results-summary"><strong>{rows.length}</strong> resultado(s)</div>
    {loading ? <Skeleton rows={6} /> : visible.length ? <div className="data-table"><table><thead><tr><th>Processo</th><th>Protocolo</th><th>Tipo</th><th>Empreendimento</th><th>Responsável</th><th>Abertura</th><th>Prazo</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visible.map((item) => <ProcessRow key={item.id} item={item} state={state} onOpen={() => navigate(`/processos/${item.id}`)} />)}</tbody></table></div> : <EmptyState title="Nenhum processo encontrado" />}
    <footer className="pagination"><label>Itens por página<select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map((value) => <option key={value}>{value}</option>)}</select></label><span>Página {page} de {pages}</span><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="Página anterior"><ChevronLeft /></button><button disabled={page === pages} onClick={() => setPage((value) => value + 1)} aria-label="Próxima página"><ChevronRight /></button></footer>
    {selected ? <ProcessDrawer process={selected} onClose={() => navigate("/processos")} /> : null}
    {wizard ? <NewProcessWizard onClose={() => setWizard(false)} /> : null}
  </>;
}

function ProcessRow({ item, state, onOpen }: { item: Processo; state: ReturnType<typeof useApp>["state"]; onOpen(): void }) {
  const enterprise = state.empreendimentos.find((entry) => entry.id === item.empreendimentoId)?.nome ?? "-";
  return <tr><td data-label="Processo"><button className="table-link" onClick={onOpen}>{item.numero}</button></td><td data-label="Protocolo">{item.protocolo}</td><td data-label="Tipo">{item.tipoLicenca}</td><td data-label="Empreendimento">{enterprise}</td><td data-label="Responsável">{item.analista}</td><td data-label="Abertura">{item.abertura}</td><td data-label="Prazo">{item.prazo}</td><td data-label="Situação"><StatusBadge>{item.status}</StatusBadge></td><td data-label="Ação"><Button variant="ghost" onClick={onOpen}>Ver detalhes</Button></td></tr>;
}

function ProcessDrawer({ process, onClose }: { process: Processo; onClose(): void }) {
  const { state, session, refresh, notify } = useApp();
  const [tab, setTab] = useState("visao");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [operationError, setOperationError] = useState("");
  const [analystId, setAnalystId] = useState("");
  const [nextStatus, setNextStatus] = useState<Status>("Em análise");
  const [statusNote, setStatusNote] = useState("");
  const enterprise = state.empreendimentos.find((item) => item.id === process.empreendimentoId);
  const entrepreneur = state.empreendedores.find((item) => item.id === process.empreendedorId);
  const isInternal = session?.perfil === "Administrador" || session?.perfil === "Analista";
  const tabs = ["visao", "andamento", "documentos", "mensagens", "fiscalizacoes", "pareceres", "condicionantes", "oficiais", ...(session?.perfil === "Administrador" ? ["auditoria"] : [])];
  const labels: Record<string, string> = { visao: "Visão geral", andamento: "Andamento", documentos: "Documentos", mensagens: "Mensagens", fiscalizacoes: "Fiscalizações", pareceres: "Pareceres", condicionantes: "Condicionantes", oficiais: "Documentos oficiais", auditoria: "Auditoria" };

  const perform = async (name: string, action: () => Promise<unknown>, shouldRefresh = true) => {
    if (busyAction) return false;
    setBusyAction(name);
    setOperationError("");
    try {
      await action();
      if (shouldRefresh) await refresh();
      notify(shouldRefresh ? "Operação concluída com sucesso." : "Download iniciado.");
      return true;
    } catch (cause) {
      const message = getUserErrorMessage(cause);
      setOperationError(message);
      notify(message, "error");
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    await perform("message", async () => {
      await sendProcessMessageApi(session.token, process.id, message);
      setMessage("");
    });
  };

  return <Modal title={`Processo ${process.numero}`} onClose={onClose}>
    <div className="drawer-summary"><StatusBadge>{process.status}</StatusBadge><span>{process.tipoLicenca}</span><span><Calendar />Prazo: {process.prazo}</span></div>
    <div className="detail-tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{labels[item]}</button>)}</div>
    <section className="detail-content">
      {operationError ? <div className="field-error" role="alert">{operationError}</div> : null}
      {tab === "visao" ? <>
        <dl className="detail-grid">
          <div><dt>Protocolo</dt><dd>{process.protocolo}</dd></div><div><dt>Empreendedor</dt><dd>{entrepreneur?.nome ?? "-"}</dd></div>
          <div><dt>Empreendimento</dt><dd>{enterprise?.nome ?? "-"}</dd></div><div><dt>Responsável</dt><dd>{process.analista}</dd></div>
          <div><dt>Abertura</dt><dd>{process.abertura}</dd></div><div><dt>Localização</dt><dd>{enterprise?.latitude ? <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${enterprise.latitude}&mlon=${enterprise.longitude}`}><MapPin />Abrir mapa</a> : "Não informada"}</dd></div>
        </dl>
        {isInternal && session ? <section className="process-actions"><h3>Tramitação</h3><div className="action-row">{session.perfil === "Administrador" ? <label>Distribuir para<select value={analystId} onChange={(event) => setAnalystId(event.target.value)}><option value="">Selecione o analista</option>{state.usuarios.filter((user) => user.perfil === "Analista" && user.ativo).map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label> : <span>Assumir este processo para análise</span>}<Button disabled={session.perfil === "Administrador" && !analystId} loading={busyAction === "assign"} onClick={() => perform("assign", () => assignProcessApi(session.token, process.id, analystId || undefined))}>{session.perfil === "Administrador" ? "Distribuir" : "Assumir processo"}</Button></div><form className="workflow-form" onSubmit={(event) => { event.preventDefault(); void perform("status", () => updateProcessStatusApi(session.token, process.id, nextStatus, statusNote)); }}><label>Nova situação<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as Status)}>{["Recebido", "Em análise", "Aguardando documentos", "Deferido", "Indeferido", "Arquivado"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Justificativa<input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} minLength={3} required /></label><Button loading={busyAction === "status"}>Atualizar situação</Button></form></section> : null}
        {session?.perfil === "Empreendedor" && process.licencaEmitida ? <div className="process-actions"><Button loading={busyAction === "renew"} onClick={() => perform("renew", () => renewProcessApi(session.token, process.id))}><RefreshCw />Solicitar renovação</Button></div> : null}
      </> : null}
      {tab === "andamento" ? <ol className="timeline">{process.timeline.map((item) => <li className={item.current ? "current" : ""} key={item.id}><i /><div><strong>{item.label}</strong><span>{item.actor} · {item.date}</span></div></li>)}</ol> : null}
      {tab === "documentos" ? <>
        <div className="document-list">{process.documentos.map((doc) => <article key={doc.id}><div><strong>{doc.nome}</strong><StatusBadge>{doc.status}</StatusBadge></div>{doc.observacao ? <p>{doc.observacao}</p> : null}<div className="document-actions">{doc.arquivo && session ? <Button variant="ghost" onClick={() => perform(`download-${doc.id}`, async () => saveBlob(await downloadDocumentApi(session.token, doc.id), doc.arquivo ?? `${doc.nome}.pdf`), false)}><Download />Baixar</Button> : null}{(doc.status === "Pendente" || doc.status === "Recusado") && session ? <label className="button button--secondary"><Upload />Enviar PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void perform(`upload-${doc.id}`, () => uploadDocumentApi(session.token, doc.id, file)); }} /></label> : null}{isInternal && session && doc.status === "Enviado" ? <><Button variant="ghost" onClick={() => perform(`validate-${doc.id}`, () => validateDocumentApi(session.token, doc.id, "VALIDADO"))}><CheckCircle2 />Validar</Button><Button variant="ghost" onClick={() => { const notes = window.prompt("Informe o motivo da recusa:") ?? ""; if (notes.trim()) void perform(`reject-${doc.id}`, () => validateDocumentApi(session.token, doc.id, "RECUSADO", notes)); }}><XCircle />Recusar</Button></> : null}</div></article>)}</div>
        {isInternal && session ? <form className="message-form" onSubmit={(event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const name = String(form.get("documentName") ?? ""); void perform("request-document", () => requestProcessDocumentApi(session.token, process.id, name)).then((success) => { if (success) formElement.reset(); }); }}><label>Solicitar documento complementar<input name="documentName" minLength={3} required /></label><Button loading={busyAction === "request-document"}><FilePlus2 />Solicitar complemento</Button></form> : null}
      </> : null}
      {tab === "mensagens" ? <><div className="message-list">{process.mensagens.map((item) => <article key={item.id}><strong>{item.autor}</strong><p>{item.texto}</p><time>{item.data}</time></article>)}</div><form className="message-form" onSubmit={send}><label htmlFor="message">Nova mensagem</label><textarea id="message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={3} required /><Button loading={busyAction === "message"}>Enviar mensagem</Button></form></> : null}
      {tab === "fiscalizacoes" ? <div className="record-list">{state.fiscalizacoes.filter((item) => item.processoId === process.id).map((item) => <article key={item.id}><strong>{item.tipo}</strong><span>{item.data} · {item.fiscal}</span><span>{item.gps || "Coordenadas não informadas"} · {item.anexos?.length ?? 0} anexo(s)</span><StatusBadge>{item.status ?? "Agendada"}</StatusBadge>{item.relatorio ? <p>{item.relatorio}</p> : null}{item.conclusao ? <p><strong>Conclusão:</strong> {item.conclusao}</p> : null}{session && item.anexos?.length ? <div className="document-actions">{item.anexos.map((attachment) => <Button variant="ghost" key={attachment.id} onClick={() => perform(`inspection-attachment-${attachment.id}`, async () => saveBlob(await downloadInspectionAttachmentApi(session.token, attachment.id), attachment.nome), false)}><Download />{attachment.nome}</Button>)}</div> : null}</article>)}</div> : null}
      {tab === "pareceres" ? <><div className="record-list">{process.pareceres?.length ? process.pareceres.map((opinion) => <article key={opinion.id}><strong>{opinion.conclusao}</strong><p>{opinion.conteudo}</p><span>{opinion.autor ?? "Analista"} · {opinion.data}</span></article>) : <EmptyState title="Nenhum parecer emitido" />}</div>{isInternal && session ? <form className="message-form" onSubmit={(event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const conclusion = String(form.get("conclusion") ?? ""); const content = String(form.get("content") ?? ""); void perform("opinion", () => createOpinionApi(session.token, process.id, conclusion, content)).then((success) => { if (success) formElement.reset(); }); }}><label>Conclusão<input name="conclusion" minLength={3} required /></label><label>Fundamentação<textarea name="content" minLength={10} required rows={8} /></label><Button loading={busyAction === "opinion"}><FileCheck2 />Registrar parecer</Button></form> : null}</> : null}
      {tab === "condicionantes" ? <><div className="record-list">{process.condicionantesDetalhadas?.length ? process.condicionantesDetalhadas.map((condition) => <article key={condition.id}><div className="record-heading"><strong>{condition.descricao}</strong><StatusBadge>{condition.status}</StatusBadge></div><span>Prazo: {condition.prazo}</span>{condition.observacao ? <p>{condition.observacao}</p> : null}<div className="document-actions">{session?.perfil === "Empreendedor" && condition.status === "Pendente" ? <Button variant="ghost" onClick={() => perform(`condition-${condition.id}`, () => updateConditionApi(session.token, process.id, condition.id, "EM_CUMPRIMENTO", "Cumprimento informado pelo empreendedor."))}>Informar cumprimento</Button> : null}{isInternal && session && condition.status !== "Cumprida" ? <><Button variant="ghost" onClick={() => perform(`condition-${condition.id}`, () => updateConditionApi(session.token, process.id, condition.id, "CUMPRIDA"))}><CheckCircle2 />Marcar cumprida</Button><Button variant="ghost" onClick={() => perform(`condition-expired-${condition.id}`, () => updateConditionApi(session.token, process.id, condition.id, "VENCIDA"))}>Marcar vencida</Button></> : null}</div></article>) : <EmptyState title="Nenhuma condicionante cadastrada" />}</div>{isInternal && session ? <form className="message-form" onSubmit={(event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); void perform("condition-create", () => createConditionApi(session.token, process.id, String(form.get("description") ?? ""), String(form.get("dueDate") ?? ""), String(form.get("notes") ?? ""))).then((success) => { if (success) formElement.reset(); }); }}><label>Condicionante<textarea name="description" minLength={5} required /></label><label>Prazo<input name="dueDate" type="date" required /></label><label>Observações<textarea name="notes" /></label><Button loading={busyAction === "condition-create"}><Plus />Adicionar condicionante</Button></form> : null}</> : null}
      {tab === "oficiais" ? <><div className="record-list">{process.documentosEmitidos?.length ? process.documentosEmitidos.map((document) => <article key={document.id}><div className="record-heading"><strong>{document.tipo} · {document.numero}</strong><span>{document.emissao}</span></div>{document.validade ? <p>Validade: {document.validade}</p> : null}{document.disponivelParaDownload && session ? <Button variant="ghost" onClick={() => perform(`issued-${document.id}`, async () => saveBlob(await downloadIssuedDocumentApi(session.token, document.id), `${document.numero}.pdf`), false)}><Download />Baixar PDF</Button> : null}</article>) : <EmptyState title="Nenhum documento oficial emitido" />}</div>{isInternal && session ? <form className="message-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const type = String(form.get("type")) as "LICENCA" | "CERTIDAO" | "DECLARACAO" | "AUTORIZACAO" | "OFICIO" | "NOTIFICACAO" | "PARECER"; const validUntil = String(form.get("validUntil") ?? ""); void perform("issue", async () => saveBlob(await issueOfficialDocumentApi(session.token, process.id, { type, subject: String(form.get("subject") ?? "") || undefined, body: String(form.get("body") ?? "") || undefined, validUntil: validUntil || undefined }), `${type}-${process.numero}.pdf`)); }}><label>Tipo de documento<select name="type">{[["LICENCA", "Licença ambiental"], ["CERTIDAO", "Certidão"], ["DECLARACAO", "Declaração"], ["AUTORIZACAO", "Autorização"], ["OFICIO", "Ofício"], ["NOTIFICACAO", "Notificação"], ["PARECER", "Parecer técnico"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Validade<input name="validUntil" type="date" /></label><label>Assunto<input name="subject" /></label><label>Texto complementar<textarea name="body" rows={6} /></label><Button loading={busyAction === "issue"}><FileCheck2 />Emitir e assinar</Button></form> : null}</> : null}
      {tab === "auditoria" ? <div className="record-list">{state.auditoria.filter((item) => item.detalhe === process.id || item.detalhe.includes(process.id)).map((item) => <article key={item.id}>{item.data} · {item.acao} · {item.usuario}</article>)}</div> : null}
    </section>
  </Modal>;
}

function NewProcessWizard({ onClose }: { onClose(): void }) {
  const { state, session, refresh, notify } = useApp();
  const [step, setStep] = useState(1);
  const [enterpriseId, setEnterpriseId] = useState("");
  const [license, setLicense] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");
  const enterprise = state.empreendimentos.find((item) => item.id === enterpriseId);
  const activity = state.atividades.find((item) => item.id === enterprise?.atividadeId);
  const submit = async () => {
    if (!session || !enterprise || saving) return;
    setSaving(true);
    try {
      const result = await createProcessApi(session.token, enterprise, license);
      setCreated(result.number);
      await refresh();
      setStep(5);
    } catch (cause) {
      setError(getUserErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Nova solicitação" onClose={onClose}>
    <div className="wizard-steps">{[1, 2, 3, 4, 5].map((item) => <span className={step >= item ? "active" : ""} key={item}>{item}</span>)}</div>
    <div className="wizard-body">
      {step === 1 ? <><h3>Empreendedor e empreendimento</h3><label>Empreendimento<select value={enterpriseId} onChange={(event) => setEnterpriseId(event.target.value)}><option value="">Selecione</option>{state.empreendimentos.map((item) => <option value={item.id} key={item.id}>{item.nome}</option>)}</select></label></> : null}
      {step === 2 ? <><h3>Tipo de licença</h3><div className="choice-grid">{(activity?.licencas ?? []).map((item) => <button className={license === item ? "active" : ""} onClick={() => setLicense(item)} key={item}><strong>{item}</strong><span>Licença ambiental</span></button>)}</div></> : null}
      {step === 3 ? <><h3>Documentos necessários</h3><ul className="check-list">{(activity?.documentos ?? []).map((item) => <li key={item}><FilePlus2 />{item}<span>Obrigatório · PDF</span></li>)}</ul></> : null}
      {step === 4 ? <><h3>Revisão</h3><dl className="detail-grid"><div><dt>Empreendimento</dt><dd>{enterprise?.nome}</dd></div><div><dt>Tipo</dt><dd>{license}</dd></div><div><dt>Documentos</dt><dd>{activity?.documentos.length ?? 0} necessários</dd></div></dl>{error ? <div className="field-error">{error}</div> : null}</> : null}
      {step === 5 ? <div className="success-state"><strong>Solicitação protocolada</strong><span>{created}</span><div><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(created).then(() => notify("Número do processo copiado.")).catch(() => notify("Não foi possível copiar automaticamente. Selecione o número e copie manualmente.", "warning")); }}><Copy />Copiar</Button><Button variant="secondary" onClick={() => window.print()}><Printer />Imprimir</Button></div></div> : null}
    </div>
    <footer className="wizard-footer">{step > 1 && step < 5 ? <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>Voltar</Button> : null}{step < 4 ? <Button disabled={(step === 1 && !enterpriseId) || (step === 2 && !license)} onClick={() => setStep((value) => value + 1)}>Continuar</Button> : null}{step === 4 ? <Button loading={saving} onClick={submit}>Confirmar solicitação</Button> : null}{step === 5 ? <Button onClick={onClose}>Acessar processos</Button> : null}</footer>
  </Modal>;
}
