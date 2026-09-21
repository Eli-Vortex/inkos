/**
 * Novel Creation workbench — accessible UI primitives.
 *
 * Small, dependency-light building blocks used by every workbench surface.
 * They reuse the host Studio's lucide-react icon set and add the states the
 * authoring flows need (focus management, reduced motion, live regions).
 */

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { useWorkbench } from "./state/store";

/* ── buttons ──────────────────────────────────────────────────────────── */

export interface IconButtonProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly type?: "button" | "submit";
}

export function IconButton({ label, icon, onClick, pressed, disabled, type = "button" }: IconButtonProps) {
  return (
    <button
      type={type}
      className="nc-iconbtn"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
    >
      {icon}
    </button>
  );
}

export interface BtnProps {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly onClick?: () => void;
  readonly variant?: "default" | "primary" | "ghost" | "danger" | "seal";
  readonly disabled?: boolean;
  readonly title?: string;
  readonly type?: "button" | "submit";
}

export function Btn({ children, icon, onClick, variant = "default", disabled, title, type = "button" }: BtnProps) {
  return (
    <button type={type} className="nc-btn" data-variant={variant} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

/* ── badges ───────────────────────────────────────────────────────────── */

export type Tone = "neutral" | "ok" | "warn" | "block" | "info" | "brand";

export function Badge({ tone = "neutral", icon, children, title }: {
  readonly tone?: Tone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly title?: string;
}) {
  return (
    <span className="nc-badge" data-tone={tone} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function DemoFlag() {
  return (
    <span className="nc-demo-flag" title="当前显示的是演示数据，保存与提交只改变模拟状态">
      <Info size={12} aria-hidden="true" />
      演示数据
    </span>
  );
}

/* ── tabs ─────────────────────────────────────────────────────────────── */

export function Tabs<T extends string>({ label, value, items, onChange }: {
  readonly label: string;
  readonly value: T;
  readonly items: ReadonlyArray<{ id: T; label: string; count?: number }>;
  readonly onChange: (id: T) => void;
}) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.id);
  };

  return (
    <div className="nc-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className="nc-tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
          {item.count !== undefined && <span className="nc-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── dialog ───────────────────────────────────────────────────────────── */

export function Dialog({ open, onClose, title, description, size, children, footer }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly size?: "lg";
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  // Keep the latest onClose in a ref. Depending on it directly made the effect
  // re-run on every parent render (onClose is usually an inline arrow), which
  // restored focus then re-focused the dialog's first control on each keystroke
  // — so a textarea inside a dialog could not be typed into continuously.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Prefer the first real field over the close button, so an input dialog
    // starts with the caret in the textarea.
    const focusable = panel?.querySelector<HTMLElement>(
      "textarea, input, select, button, [href], [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"),
      ).filter((node) => !node.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // Portal to <body>: rendered in place, a fixed overlay inside a flex/grid pane
  // could still nudge the surrounding layout. Portaling guarantees the dialog
  // floats above everything without affecting the page flow.
  return createPortal(
    <div className="nc-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className="nc-dialog"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <div className="nc-dialog-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="nc-dialog-title">{title}</h2>
            {description && <p id={descId} className="nc-meta" style={{ marginTop: 4 }}>{description}</p>}
          </div>
          <IconButton label="关闭对话框" icon={<X size={16} aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="nc-dialog-body">{children}</div>
        {footer && <div className="nc-dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ── feedback ─────────────────────────────────────────────────────────── */

export function Alert({ tone = "info", title, children }: {
  readonly tone?: "info" | "warn" | "block";
  readonly title: string;
  readonly children?: ReactNode;
}) {
  const Icon = tone === "block" ? AlertTriangle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="nc-alert" data-tone={tone} role={tone === "block" ? "alert" : undefined}>
      <Icon size={15} aria-hidden="true" style={{ marginTop: 2, flex: "none" }} />
      <div className="nc-alert-body">
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

export function Progress({ value, label }: { readonly value: number; readonly label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className="nc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Skeleton({ rows = 4, label = "正在载入" }: { readonly rows?: number; readonly label?: string }) {
  return (
    <div className="nc-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} style={{ width: `${100 - index * 7}%` }} />
      ))}
      <span className="nc-visually-hidden">{label}</span>
    </div>
  );
}

export function Empty({ icon, title, detail, action }: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="nc-empty">
      <span className="nc-empty-mark" aria-hidden="true">{icon}</span>
      <strong className="nc-h2">{title}</strong>
      <p className="nc-meta" style={{ maxWidth: "44ch" }}>{detail}</p>
      {action && <div className="nc-btn-group">{action}</div>}
    </div>
  );
}

export function ToastStack() {
  const toasts = useWorkbench((state) => state.toasts);
  const dismiss = useWorkbench((state) => state.dismissToast);
  return (
    <div className="nc-toasts" role="region" aria-label="操作反馈" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="nc-toast" data-tone={toast.tone}>
          {toast.tone === "ok"
            ? <Check size={14} aria-hidden="true" style={{ marginTop: 2 }} />
            : toast.tone === "info"
              ? <Info size={14} aria-hidden="true" style={{ marginTop: 2 }} />
              : <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 2 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nc-em">{toast.title}</div>
            {toast.detail && <div className="nc-meta">{toast.detail}</div>}
          </div>
          <IconButton label="关闭提示" icon={<X size={13} aria-hidden="true" />} onClick={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}

/* ── forms ────────────────────────────────────────────────────────────── */

export function Field({ label, hint, error, children, required }: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  readonly required?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="nc-field">
      <label className="nc-field-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {required && <span className="nc-visually-hidden">必填</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && <span id={hintId} className="nc-field-help">{hint}</span>}
      {error && <span id={errorId} className="nc-field-error" role="alert">{error}</span>}
    </div>
  );
}
