import * as React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/*
  Shared page furniture.

  Every page in Studio reads the same three things — a header, a set of section
  cards, and the empty / loading / failed states — so they live here once
  instead of being re-invented per page. All colours come from the global
  tokens in src/index.css; nothing here hard-codes a palette value.
*/

/* ── page header ──────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-3xl leading-tight tracking-tight text-foreground not-italic">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/* ── section card ─────────────────────────────────────────────────────── */

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  const hasHead = Boolean(title || description || actions)
  return (
    <section className={cn("nc-surface overflow-hidden", className)}>
      {hasHead ? (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 max-w-[68ch] text-[13px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

/* ── empty ────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-muted/40 text-muted-foreground"
      >
        {icon}
      </span>
      <p className="font-serif text-lg text-foreground">{title}</p>
      {description ? (
        <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}

/* ── loading skeleton ─────────────────────────────────────────────────── */

export function LoadingState({
  label = "正在载入…",
  rows = 4,
  className,
}: {
  label?: string
  rows?: number
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex flex-col gap-2 p-4", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="block h-3 rounded-full bg-muted"
          style={{
            width: `${Math.max(35, 100 - i * 8)}%`,
            backgroundImage:
              "linear-gradient(90deg, var(--secondary) 25%, var(--muted) 37%, var(--secondary) 63%)",
            backgroundSize: "400% 100%",
            animation: "nc-studio-shimmer 1.4s ease-in-out infinite",
          }}
        />
      ))}
      <span className="sr-only">{label}</span>
      <style>{`@keyframes nc-studio-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }`}</style>
    </div>
  )
}

/* ── error ────────────────────────────────────────────────────────────── */

export function ErrorState({
  title = "载入失败",
  message,
  onRetry,
  retryLabel = "重试",
  className,
}: {
  title?: string
  message?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border border-destructive/35 bg-block-soft px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} aria-hidden="true" className="text-destructive" />
        <strong className="text-[15px] font-semibold text-destructive">{title}</strong>
      </div>
      {message ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw size={14} aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

/* ── status badge ─────────────────────────────────────────────────────── */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "block" | "seal" | "primary"

const STATUS_VARIANT: Record<StatusTone, React.ComponentProps<typeof Badge>["variant"]> = {
  neutral: "secondary",
  info: "info",
  success: "success",
  warning: "warning",
  block: "block",
  seal: "seal",
  primary: "default",
}

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant={STATUS_VARIANT[tone]} className={cn("font-medium", className)}>
      {children}
    </Badge>
  )
}

/* ── inline meta row helper ───────────────────────────────────────────── */

export function MetaRow({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: string; value: React.ReactNode }>
  className?: string
}) {
  return (
    <dl className={cn("flex flex-wrap gap-x-8 gap-y-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="font-mono text-sm text-foreground tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
