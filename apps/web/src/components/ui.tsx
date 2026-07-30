import { Search, X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Button({ variant = "primary", loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  return <button {...props} disabled={props.disabled || loading} className={`button button--${variant} ${props.className ?? ""}`}>
    {loading ? <span className="spinner" aria-hidden="true" /> : null}{children}
  </button>;
}

export function StatusBadge({ children }: { children: ReactNode }) {
  const text = String(children).toLowerCase();
  const tone = /indefer|recus|atras/.test(text) ? "danger" : /defer|emitida|valid|conclu/.test(text) ? "success" : /aguard|vistoria|prazo/.test(text) ? "warning" : "info";
  return <span className={`status status--${tone}`}>{children}</span>;
}

export function SearchField({ value, onChange, placeholder = "Pesquisar" }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">{placeholder}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function EmptyState({ title = "Nenhum registro encontrado", description = "Altere os filtros ou cadastre um novo item." }: { title?: string; description?: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>;
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton" aria-label="Carregando">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous.current?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={dialog}>
      <header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}
    </div>
  </div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div><div className="page-actions">{actions}</div></header>;
}
