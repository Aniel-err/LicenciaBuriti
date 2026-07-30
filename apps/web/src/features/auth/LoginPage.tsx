import { Eye, EyeOff, LockKeyhole, Search } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../app/providers";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/ui";
import { getUserErrorMessage } from "../../api";

export function LoginPage() {
  const { session, login } = useApp();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [show, setShow] = useState(false); const [caps, setCaps] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const navigate = useNavigate(); const location = useLocation();
  if (session) return <Navigate to="/dashboard" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (loading) return; setLoading(true); setError("");
    try { await login(email, password); navigate((location.state as { from?: string } | null)?.from ?? "/dashboard", { replace: true }); }
    catch (cause) { setError(getUserErrorMessage(cause, "Não foi possível autenticar. Confira seus dados.")); }
    finally { setLoading(false); }
  };
  const detectCaps = (event: KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState("CapsLock"));
  return <main className="login-shell"><section className="login-institutional"><Brand /><div><h1>Gestão ambiental com clareza e responsabilidade.</h1><p>Plataforma municipal para protocolo, análise, fiscalização e acompanhamento do licenciamento ambiental.</p></div><div className="security-note"><LockKeyhole /><span>Acesso protegido. Dados tratados conforme regras de segurança e proteção de dados.</span></div></section>
    <section className="login-panel"><div className="login-card"><span className="beta-tag">Ambiente beta</span><h2>Entrar no sistema</h2><p>Use suas credenciais institucionais.</p><form onSubmit={submit} noValidate>
      <label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nome@buriti.ma.gov.br" />
      <label htmlFor="password">Senha</label><div className="password-field"><input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyUp={detectCaps} required /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff /> : <Eye />}</button></div>
      {caps ? <small className="field-warning">Caps Lock está ativado.</small> : null}{error ? <div className="field-error" role="alert">{error}</div> : null}<Button loading={loading} type="submit">Entrar</Button>
    </form><Link className="public-access" to="/consulta"><Search />Consultar processo sem entrar</Link></div><footer>Buriti/MA · Licencia Buriti beta · <a href="#privacidade">Política de privacidade</a></footer></section></main>;
}
