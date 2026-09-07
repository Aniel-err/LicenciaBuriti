import { CheckCircle2, KeyRound, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { forgotPasswordApi, getUserErrorMessage, resetPasswordApi } from "../../api";
import { useApp } from "../../app/providers";
import { Button } from "../../components/ui";

export function RegisterPage() {
  const { session, register } = useApp();
  const navigate = useNavigate();
  const [personType, setPersonType] = useState<"PF" | "PJ">("PF");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const formData = new FormData(event.currentTarget);
    const data: Record<string, string> = {};
    formData.forEach((value, key) => { data[key] = String(value); });
    if (data.senha !== data.confirmarSenha) {
      setError("As senhas informadas nao coincidem.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register({ ...data, tipo: personType });
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(getUserErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  return <section className="account-page">
    <header><UserPlus /><div><h1>Criar conta de empreendedor</h1><p>Cadastre-se para registrar empreendimentos e solicitar licenças.</p></div></header>
    <form className="account-form" onSubmit={submit}>
      <fieldset className="segmented"><legend>Tipo de pessoa</legend><button type="button" className={personType === "PF" ? "active" : ""} onClick={() => setPersonType("PF")}>Pessoa física</button><button type="button" className={personType === "PJ" ? "active" : ""} onClick={() => setPersonType("PJ")}>Pessoa jurídica</button></fieldset>
      <label>{personType === "PF" ? "Nome completo" : "Razão social"}<input name="nome" required minLength={3} /></label>
      {personType === "PF" ? <><label>CPF<input name="cpf" inputMode="numeric" required /></label><label>RG<input name="rg" required /></label></> : <><label>CNPJ<input name="cnpj" inputMode="numeric" required /></label><label>Nome fantasia<input name="nomeFantasia" /></label><label>Inscrição estadual<input name="inscricaoEstadual" /></label><label>Representante legal<input name="responsavelLegal" /></label></>}
      <label>Telefone<input name="telefone" inputMode="tel" required /></label>
      <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
      <label className="wide">Endereço<input name="endereco" required /></label>
      <label>Senha<input name="senha" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label>Confirmar senha<input name="confirmarSenha" type="password" autoComplete="new-password" minLength={12} required /></label>
      <p className="form-help wide">Use pelo menos 12 caracteres, com letra maiúscula, minúscula e número.</p>
      {error ? <div className="field-error wide" role="alert">{error}</div> : null}
      <footer className="wide"><Link to="/login">Já tenho uma conta</Link><Button loading={loading}>Criar conta</Button></footer>
    </form>
  </section>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [developmentToken, setDevelopmentToken] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await forgotPasswordApi(email);
      setMessage(result.message);
      setDevelopmentToken(result.developmentResetToken ?? "");
    } catch (cause) {
      setError(getUserErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  return <section className="account-page account-page--compact">
    <header><KeyRound /><div><h1>Recuperar senha</h1><p>Enviaremos um link de redefinição para o e-mail cadastrado.</p></div></header>
    {message ? <div className="success-panel"><CheckCircle2 /><p>{message}</p>{developmentToken ? <Link className="button button--primary" to={`/redefinir-senha?token=${encodeURIComponent(developmentToken)}`}>Continuar no ambiente local</Link> : null}</div> : <form className="account-form" onSubmit={submit}><label className="wide">E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoFocus /></label>{error ? <div className="field-error wide" role="alert">{error}</div> : null}<footer className="wide"><Link to="/login">Voltar ao login</Link><Button loading={loading}>Enviar instruções</Button></footer></form>}
  </section>;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("senha") ?? "");
    const confirmation = String(data.get("confirmarSenha") ?? "");
    if (password !== confirmation) {
      setError("As senhas informadas nao coincidem.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await resetPasswordApi(token, password);
      setComplete(true);
    } catch (cause) {
      setError(getUserErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  return <section className="account-page account-page--compact">
    <header><KeyRound /><div><h1>Definir nova senha</h1><p>Escolha uma nova senha segura para sua conta.</p></div></header>
    {complete ? <div className="success-panel"><CheckCircle2 /><p>Senha redefinida com sucesso.</p><Link className="button button--primary" to="/login">Entrar no sistema</Link></div> : <form className="account-form" onSubmit={submit}><label className="wide">Nova senha<input name="senha" type="password" minLength={12} required autoFocus /></label><label className="wide">Confirmar nova senha<input name="confirmarSenha" type="password" minLength={12} required /></label>{!token ? <div className="field-error wide">O link de redefinição está incompleto.</div> : null}{error ? <div className="field-error wide" role="alert">{error}</div> : null}<footer className="wide"><Link to="/login">Voltar ao login</Link><Button disabled={!token} loading={loading}>Salvar nova senha</Button></footer></form>}
  </section>;
}
