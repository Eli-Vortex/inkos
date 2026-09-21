import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface PromptDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly multiline?: boolean;
  /** When false, the confirm button is disabled until the field is non-empty. */
  readonly requireValue?: boolean;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

/**
 * In-app replacement for `window.prompt`.
 *
 * Native prompt/confirm dialogs are blocked in some embeds and look nothing like
 * the rest of the app, so author-facing inputs use this portal dialog instead.
 */
export function PromptDialog({
  open,
  title,
  description,
  placeholder,
  defaultValue = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  multiline = true,
  requireValue = false,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    // Focus after paint so the field is ready to type immediately.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, defaultValue, onCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const disabled = requireValue && value.trim().length === 0;

  const submit = () => {
    if (disabled) return;
    onConfirm(value);
  };

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
        className="chat-msg-assistant mx-4 w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-(--nc-shadow-3)"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={onCancel}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-3">
          {description && <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          {multiline ? (
            <textarea
              ref={inputRef}
              className="h-28 w-full resize-y rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <input
              ref={inputRef}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline bg-secondary/40 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-secondary px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
