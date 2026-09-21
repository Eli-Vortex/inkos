import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly variant?: "danger" | "default";
  /** Notice mode: hide the cancel button (single acknowledgement action). */
  readonly hideCancel?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isDanger = variant === "danger";

  return createPortal(
    <div
      ref={overlayRef}
      className="fade-in fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm"
      style={{ background: "var(--nc-scrim)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="chat-msg-assistant mx-4 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-(--nc-shadow-3)"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            {isDanger && (
              <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-block-soft text-destructive">
                <AlertTriangle size={18} aria-hidden="true" />
              </span>
            )}
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={onCancel}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-hairline bg-secondary/40 px-5 py-3">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-secondary px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 ${
              isDanger
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
