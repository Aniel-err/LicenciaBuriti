import { FileText } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand--compact" : ""}`}>
    <span className="brand__mark" aria-hidden="true"><FileText /></span>
    <span className="brand__copy"><strong>Licencia Buriti</strong>{compact ? null : <small>Secretaria Municipal de Meio Ambiente e Turismo</small>}</span>
    {compact ? null : <span className="beta-tag">Versão beta</span>}
  </div>;
}
