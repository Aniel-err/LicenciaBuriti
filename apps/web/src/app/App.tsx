import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./providers";
import { Skeleton } from "../components/ui";
import { LoginPage } from "../features/auth/LoginPage";
import { ForgotPasswordPage, RegisterPage, ResetPasswordPage } from "../features/auth/AccountPages";
import { InstitutionalContentPage, LicenseValidationPage, PublicHome, PublicSearchPage } from "../features/public/PublicPages";
import { RegistryPage, ReportsPage, SettingsPage } from "../features/registry/RegistryPages";
import { AppLayout } from "../layouts/AppLayout";
import { PublicLayout } from "../layouts/PublicLayout";
import { canAccess } from "../security/access";

const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ProcessesPage = lazy(() => import("../features/processes/ProcessesPage").then((module) => ({ default: module.ProcessesPage })));

function Protected({ children }: { children: ReactNode }) {
  const { session } = useApp(); const location = useLocation();
  return session ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function Authorized({ route, children }: { route: string; children: ReactNode }) {
  const { session } = useApp();
  return session && canAccess(session.perfil, route) ? children : <Navigate to="/403" replace />;
}

function NotFound() { return <main className="error-page"><strong>404</strong><h1>Página não encontrada</h1><a href="/dashboard">Voltar ao painel</a></main>; }
function Forbidden() { return <main className="error-page"><strong>403</strong><h1>Acesso não autorizado</h1><p>Seu perfil não possui permissão para esta área.</p><a href="/dashboard">Voltar ao painel</a></main>; }

export function App() {
  return <BrowserRouter><AppProvider><Suspense fallback={<div className="route-loading"><Skeleton rows={6} /></div>}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<PublicLayout />}><Route index element={<PublicHome />} /><Route path="cadastro" element={<RegisterPage />} /><Route path="recuperar-senha" element={<ForgotPasswordPage />} /><Route path="redefinir-senha" element={<ResetPasswordPage />} /><Route path="manual" element={<InstitutionalContentPage type="MANUAL" />} /><Route path="legislacao" element={<InstitutionalContentPage type="LEGISLACAO" />} /><Route path="consulta" element={<PublicSearchPage />} /><Route path="validar-documento" element={<LicenseValidationPage />} /></Route>
    <Route path="/403" element={<Forbidden />} />
    <Route element={<Protected><AppLayout /></Protected>}>
      <Route path="dashboard" element={<Authorized route="dashboard"><DashboardPage /></Authorized>} />
      <Route path="processos" element={<Authorized route="processos"><ProcessesPage /></Authorized>} />
      <Route path="processos/:processId" element={<Authorized route="processos"><ProcessesPage /></Authorized>} />
      {(["empreendedores", "responsaveis", "empreendimentos", "atividades", "taxas", "fiscalizacao", "usuarios", "modelos", "conteudos"] as const).map((route) => <Route key={route} path={route} element={<Authorized route={route}><RegistryPage type={route} /></Authorized>} />)}
      <Route path="relatorios" element={<Authorized route="relatorios"><ReportsPage /></Authorized>} />
      <Route path="configuracoes" element={<Authorized route="configuracoes"><SettingsPage /></Authorized>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense></AppProvider></BrowserRouter>;
}
