import assert from "node:assert/strict";
import { stateForSession } from "../src/security/access.js";
import type { AppState } from "../src/types.js";

const state: AppState = {
  usuarios: [
    { id: "user-1", nome: "Owner", email: "owner@example.test", senha: "", perfil: "Empreendedor", telefone: "", ativo: true, ultimoAcesso: "-" },
    { id: "user-2", nome: "Other", email: "other@example.test", senha: "", perfil: "Empreendedor", telefone: "", ativo: true, ultimoAcesso: "-", empreendedorId: "emp-2" }
  ],
  empreendedores: [
    { id: "emp-1", tipo: "PJ", nome: "Empresa 1", documento: "1", responsavelLegal: "Owner", telefone: "", email: "", endereco: "" },
    { id: "emp-2", tipo: "PJ", nome: "Empresa 2", documento: "2", responsavelLegal: "Other", telefone: "", email: "", endereco: "" }
  ],
  empreendimentos: [
    { id: "end-1", empreendedorId: "emp-1", nome: "Area 1", endereco: "", municipio: "", latitude: "", longitude: "", atividadeId: "ativ-1", area: "", porte: "", potencial: "", classificacao: "Urbano" }
  ],
  atividades: [],
  processos: [
    { id: "proc-1", numero: "2026.000001", protocolo: "P1", tipoLicenca: "LI", empreendedorId: "emp-1", empreendimentoId: "end-1", analista: "A", prazo: "-", status: "Recebido", abertura: "-", condicionantes: [], documentos: [], mensagens: [], timeline: [] }
  ],
  taxas: [],
  fiscalizacoes: [{ id: "fis-1", processoId: "proc-1", tipo: "Vistoria", fiscal: "F", data: "-", gps: "", relatorio: "", fotos: [] }],
  modelos: [],
  configuracao: { orgao: "Orgao", municipio: "Cidade", prazoAnaliseDias: 30, alertaVencimentoDias: 45, tamanhoMaxUploadMb: 10, consultaPublicaAtiva: true },
  auditoria: [{ id: "aud-1", data: "-", usuario: "Other", acao: "READ", entidade: "proc-1", detalhe: "" }],
  notificacoes: [{ id: "not-1", data: "-", titulo: "Alerta", mensagem: "Privado", lida: false, tipo: "Sistema" }]
};

const unlinked = stateForSession(state, {
  userId: "user-1",
  nome: "Owner",
  email: "owner@example.test",
  perfil: "Empreendedor"
});

assert.deepEqual(unlinked.empreendedores, []);
assert.deepEqual(unlinked.empreendimentos, []);
assert.deepEqual(unlinked.processos, []);
assert.deepEqual(unlinked.fiscalizacoes, []);
assert.deepEqual(unlinked.auditoria, []);
assert.deepEqual(unlinked.notificacoes, []);

const linked = stateForSession(state, {
  userId: "user-1",
  nome: "Owner",
  email: "owner@example.test",
  perfil: "Empreendedor",
  empreendedorId: "emp-1"
});

assert.equal(linked.processos.length, 1);
assert.equal(linked.processos[0]?.id, "proc-1");

console.log("access-policy.test.ts passou");
