import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getUserErrorMessage, loadAppState, loginApi, perfilFromRole } from "../api";
import { atividadesSeed, auditoriaSeed, configuracaoSeed, empreendedoresSeed, empreendimentosSeed, fiscalizacoesSeed, modelosSeed, notificacoesSeed, processosSeed, taxasSeed, usuariosSeed } from "../data";
import { stateForSession, type AuthSession } from "../security/access";
import type { AppState } from "../types";

const SESSION_KEY = "licencia-buriti-session-v2";
const mockEnabled = import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_DATA === "true";
const emptyState: AppState = { usuarios: [], empreendedores: [], empreendimentos: [], atividades: [], processos: [], taxas: [], fiscalizacoes: [], modelos: [], configuracao: configuracaoSeed, auditoria: [], notificacoes: [] };
const devState: AppState = { usuarios: usuariosSeed, empreendedores: empreendedoresSeed, empreendimentos: empreendimentosSeed, atividades: atividadesSeed, processos: processosSeed, taxas: taxasSeed, fiscalizacoes: fiscalizacoesSeed, modelos: modelosSeed, configuracao: configuracaoSeed, auditoria: auditoriaSeed, notificacoes: notificacoesSeed };

type AppContextValue = {
  session: AuthSession | null;
  state: AppState;
  loading: boolean;
  error: string;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  refresh(): Promise<void>;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  clearError(): void;
};

const AppContext = createContext<AppContextValue | null>(null);

function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession);
  const [rawState, setState] = useState<AppState>(() => mockEnabled ? devState : emptyState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setState(mockEnabled ? devState : emptyState);
  };

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    try {
      setState(await loadAppState(session.token, session.perfil, rawState));
      setError("");
    } catch (cause) {
      setError(getUserErrorMessage(cause, "Não foi possível atualizar os dados."));
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await loginApi(email, password);
    const next: AuthSession = { userId: response.user.id, nome: response.user.name, email: response.user.email, perfil: perfilFromRole(response.user.role), empreendedorId: response.user.entrepreneurId ?? undefined, token: response.token };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  };

  useEffect(() => {
    const expire = () => logout();
    window.addEventListener("licencia:unauthorized", expire);
    return () => window.removeEventListener("licencia:unauthorized", expire);
  }, []);

  useEffect(() => { if (session) void refresh(); }, [session?.token]);

  const state = useMemo(() => session ? stateForSession(rawState, session) : rawState, [rawState, session]);
  const value = useMemo<AppContextValue>(() => ({ session, state, loading, error, login, logout, refresh, setState, clearError: () => setError("") }), [session, state, loading, error]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp deve ser usado dentro de AppProvider");
  return value;
}
