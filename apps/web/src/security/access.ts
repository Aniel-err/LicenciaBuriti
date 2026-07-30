import type { AppState, Perfil } from "../types";

export type AuthSession = {
  userId: string;
  nome: string;
  email: string;
  perfil: Exclude<Perfil, "Público">;
  empreendedorId?: string;
  token: string;
};

export function stateForSession(state: AppState, session: AuthSession): AppState {
  if (session.perfil !== "Empreendedor") return state;
  if (!session.empreendedorId) {
    return { ...state, usuarios: [], empreendedores: [], empreendimentos: [], processos: [], fiscalizacoes: [], auditoria: [], notificacoes: [] };
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
    auditoria: [],
    notificacoes: []
  };
}

export const routeRoles: Record<string, AuthSession["perfil"][]> = {
  dashboard: ["Administrador", "Analista", "Fiscal", "Empreendedor"],
  processos: ["Administrador", "Analista", "Fiscal", "Empreendedor"],
  empreendedores: ["Administrador", "Analista"],
  empreendimentos: ["Administrador", "Analista", "Empreendedor"],
  atividades: ["Administrador", "Analista"],
  taxas: ["Administrador"],
  fiscalizacao: ["Administrador", "Analista", "Fiscal"],
  usuarios: ["Administrador"],
  modelos: ["Administrador", "Analista"],
  relatorios: ["Administrador", "Analista", "Fiscal", "Empreendedor"],
  configuracoes: ["Administrador"]
};

export function canAccess(perfil: AuthSession["perfil"], route: string) {
  return routeRoles[route]?.includes(perfil) ?? false;
}
