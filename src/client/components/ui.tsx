import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconX } from './icons';

/* ------------------------------- toasts ------------------------------- */
type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string; leaving?: boolean };
const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 240);
  }, []);
  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss]
  );
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'out' : ''}`}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <IconX width={14} height={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- modal ------------------------------- */
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  // Closing plays a short fade-out first, then hands control back to the parent to unmount.
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const requestClose = useCallback(() => {
    if (timer.current !== undefined) return;
    setClosing(true);
    timer.current = window.setTimeout(onClose, 170);
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);
  return (
    <div className={`modal-backdrop ${closing ? 'out' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={`modal glass-strong ${wide ? 'wide' : ''} ${closing ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={requestClose} aria-label="Close dialog">
            <IconX />
          </button>
        </div>
        {children}
        {footer && <div className="btn-row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel} footer={
      <>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {confirmLabel}
        </button>
      </>
    }>
      <div className="muted">{body}</div>
    </Modal>
  );
}

/* ------------------------------- form bits ------------------------------- */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label>
        {label}
        {required ? <span style={{ color: 'var(--crimson)' }}> *</span> : null}
      </label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

/* ------------------------------- states ------------------------------- */
export function EmptyState({ glyph = '🌱', title, body, action }: { glyph?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="glyph" aria-hidden="true">{glyph}</div>
      <h3>{title}</h3>
      {body ? <p className="muted" style={{ maxWidth: 460, margin: '0 auto 14px' }}>{body}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="row" style={{ padding: '26px 0', justifyContent: 'center' }} role="status">
      <span className="spinner dark" /> <span className="muted">{label}</span>
    </div>
  );
}

export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card card-pad" style={{ borderColor: 'var(--crimson)', background: 'var(--crimson-soft)' }}>
      <strong>Something went wrong.</strong>
      <p className="muted" style={{ margin: '6px 0 10px' }}>{message}</p>
      {retry ? <button className="btn btn-sm btn-outline" onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function ProgressBar({ percent, kind = 'crimson', label }: { percent: number; kind?: 'crimson' | 'silver' | 'gold'; label?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={`progress ${kind}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
      <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</button>
      <span className="muted small">Page {page} of {pages}</span>
      <button className="btn btn-sm btn-outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} className={active === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined ? <span className="badge gray" style={{ marginLeft: 8 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- image with fallback ------------------------------- */
export function SmartImage({ src, alt, className, style }: { src?: string | null; alt: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className={className} style={{ background: 'linear-gradient(135deg, var(--crimson-soft), var(--gold-soft))', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }} aria-label={alt} role="img">
        <span style={{ fontSize: '2rem', opacity: 0.5 }} aria-hidden="true">☺</span>
      </div>
    );
  }
  return <img className={className} style={style} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

/* ------------------------------- count-up (counts when scrolled into view) ------------------------------- */
export function CountUp({ value, suffix = '', duration = 1800 }: { value: number | string; suffix?: string; duration?: number }) {
  const target = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  const isNum = Number.isFinite(target);
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!isNum) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, isNum, duration]);

  if (!isNum) return <span>{value}{suffix}</span>;
  return <span ref={ref}>{shown.toLocaleString()}{suffix}</span>;
}

/* ------------------------------- marquee ribbon ------------------------------- */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i}>
            {t}
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}
