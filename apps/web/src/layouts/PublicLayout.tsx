import { LogIn } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";

export function PublicLayout() {
  return <div className="public-shell"><header className="public-header"><Brand /><nav aria-label="Serviços públicos"><NavLink to="/consulta">Consultar processo</NavLink><NavLink to="/validar-documento">Validar documento</NavLink><NavLink to="/manual">Manual</NavLink><NavLink to="/legislacao">Legislação</NavLink><Link className="button button--secondary" to="/login"><LogIn size={18} />Acesso ao sistema</Link></nav></header><main><Outlet /></main><footer className="public-footer"><span>Município de Buriti, Maranhão</span><span>Licencia Buriti · Versão beta</span><a href="#privacidade">Privacidade e proteção de dados</a></footer></div>;
}
