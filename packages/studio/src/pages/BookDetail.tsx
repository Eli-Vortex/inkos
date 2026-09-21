import { fetchJson, useApi, postApi } from "../hooks/use-api";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import type { SSEMessage } from "../hooks/use-sse";
import { useColors } from "../hooks/use-colors";
import { ErrorState, LoadingState } from "../components/ui/states";
import { deriveBookActivity, shouldRefetchBookView } from "../hooks/use-book-activity";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog";
import {
  ChevronLeft,
  Zap,
  FileText,
  CheckCheck,
  BarChart2,
  Download,
  Search,
  Wand2,
  Eye,
  Database,
  Check,
  X,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Sparkles,
  Trash2,
  Save,
  Hand,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Info
} from "lucide-react";

interface ChapterMeta {
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly wordCount: number;
}

interface BookData {
  readonly book: {
    readonly id: string;
    readonly title: string;
    readonly genre: string;
    readonly status: string;
    readonly chapterWordCount: number;
    readonly targetChapters?: number;
    readonly language?: string;
    readonly fanficMode?: string;
  };
  readonly chapters: ReadonlyArray<ChapterMeta>;
  readonly nextChapter: number;
}

interface BookMaterialEntry {
  readonly facet: string;
  readonly name: string;
  readonly title: string;
  readonly path: string;
  readonly charCount: number;
  readonly excerpt: string;
}

interface BookMaterialFacet {
  readonly facet: string;
  readonly entries: ReadonlyArray<BookMaterialEntry>;
}

type ReviseMode = "spot-fix" | "polish" | "rewrite" | "rework" | "anti-detect";
type ExportFormat = "txt" | "md" | "epub";
type BookStatus = "active" | "paused" | "outlining" | "completed" | "dropped";

interface Nav {
  toDashboard: () => void;
  toChapter: (bookId: string, num: number) => void;
  toAnalytics: (bookId: string) => void;
  toTruth: (bookId: string) => void;
}

function translateChapterStatus(status: string, t: TFunction): string {
  const map: Record<string, () => string> = {
    "ready-for-review": () => t("chapter.readyForReview"),
    "approved": () => t("chapter.approved"),
    "drafted": () => t("chapter.drafted"),
    "needs-revision": () => t("chapter.needsRevision"),
    "imported": () => t("chapter.imported"),
    "audit-failed": () => t("chapter.auditFailed"),
    "card-generated": () => t("chapter.cardGenerated"),
    "drafting": () => t("chapter.drafting"),
    "auditing": () => t("chapter.auditing"),
    "audit-passed": () => t("chapter.auditPassed"),
    "state-degraded": () => t("chapter.stateDegraded"),
    "revising": () => t("chapter.revising"),
    "rejected": () => t("chapter.rejected"),
    "published": () => t("chapter.published"),
  };
  return map[status]?.() ?? status.replace(/-/g, " ");
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  "ready-for-review": { color: "text-warning bg-warning-soft", icon: <Eye size={12} /> },
  approved: { color: "text-success bg-success-soft", icon: <Check size={12} /> },
  drafted: { color: "text-muted-foreground bg-muted/20", icon: <FileText size={12} /> },
  "needs-revision": { color: "text-destructive bg-destructive/10", icon: <RotateCcw size={12} /> },
  imported: { color: "text-info bg-info-soft", icon: <Download size={12} /> },
};

export function BookDetail({
  bookId,
  nav,
  theme,
  t,
  sse,
}: {
  bookId: string;
  nav: Nav;
  theme: Theme;
  t: TFunction;
  sse: { messages: ReadonlyArray<SSEMessage> };
}) {
  const c = useColors(theme);
  const { data, loading, error, refetch } = useApi<BookData>(`/books/${bookId}`);
  const [writeRequestPending, setWriteRequestPending] = useState(false);
  const [draftRequestPending, setDraftRequestPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rewritingChapters, setRewritingChapters] = useState<ReadonlyArray<number>>([]);
  const [revisingChapters, setRevisingChapters] = useState<ReadonlyArray<number>>([]);
  const [syncingChapters, setSyncingChapters] = useState<ReadonlyArray<number>>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsWordCount, setSettingsWordCount] = useState<number | null>(null);
  const [settingsTargetChapters, setSettingsTargetChapters] = useState<number | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<BookStatus | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("txt");
  const [exportApprovedOnly, setExportApprovedOnly] = useState(false);
  const [bookActionPending, setBookActionPending] = useState<string | null>(null);
  // Auto (pipeline self-reviews) vs manual (write the draft and stop; you
  // run audit / revise / approve as checkpoint actions). This is scoped to
  // the current book, with project-level mode as the inherited default.
  const [reviewMode, setReviewMode] = useState<"auto" | "manual">("auto");
  useEffect(() => {
    void fetchJson<{ mode?: string }>(`/books/${encodeURIComponent(bookId)}/chapter-review-mode`)
      .then((r) => setReviewMode(r.mode === "manual" ? "manual" : "auto"))
      .catch(() => undefined);
  }, [bookId]);
  const [materialFacets, setMaterialFacets] = useState<ReadonlyArray<BookMaterialFacet>>([]);
  const [openMaterialKey, setOpenMaterialKey] = useState<string | null>(null);
  const [materialContent, setMaterialContent] = useState<string | null>(null);
  const loadMaterials = () => {
    void fetchJson<{ facets?: ReadonlyArray<BookMaterialFacet> }>(`/books/${encodeURIComponent(bookId)}/materials`)
      .then((r) => setMaterialFacets(r.facets ?? []))
      .catch(() => setMaterialFacets([]));
  };
  useEffect(() => {
    loadMaterials();
  }, [bookId]);
  const openMaterial = async (facet: string, name: string) => {
    const key = `${facet}/${name}`;
    if (openMaterialKey === key) {
      setOpenMaterialKey(null);
      return;
    }
    setOpenMaterialKey(key);
    setMaterialContent(null);
    try {
      const r = await fetchJson<{ content?: string }>(
        `/books/${encodeURIComponent(bookId)}/materials/${encodeURIComponent(facet)}/${encodeURIComponent(name)}`,
      );
      setMaterialContent(r.content ?? "");
    } catch {
      setMaterialContent("（读取失败）");
    }
  };
  // In-app replacements for window.prompt / window.confirm / alert. Native
  // browser dialogs are blocked in some embeds and look nothing like the app.
  const promptResolver = useRef<((value: string | null) => void) | null>(null);
  const [promptCfg, setPromptCfg] = useState<{
    title: string;
    description?: string;
    placeholder?: string;
    confirmLabel?: string;
    requireValue?: boolean;
  } | null>(null);
  const askText = (cfg: NonNullable<typeof promptCfg>) =>
    new Promise<string | null>((resolve) => {
      promptResolver.current = resolve;
      setPromptCfg(cfg);
    });
  const closePrompt = (value: string | null) => {
    const resolve = promptResolver.current;
    promptResolver.current = null;
    setPromptCfg(null);
    resolve?.(value);
  };

  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const [askState, setAskState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "default";
  } | null>(null);
  const askConfirm = (cfg: NonNullable<typeof askState>) =>
    new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setAskState(cfg);
    });
  const closeAsk = (ok: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setAskState(null);
    resolve?.(ok);
  };

  const [toast, setToast] = useState<{ id: number; title: string; message: string; tone: "ok" | "error" | "info" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string, title = "提示", tone: "ok" | "error" | "info" = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    const resolvedTone =
      tone !== "info"
        ? tone
        : (title.includes("成功") || title.includes("完成") ? "ok" : title.includes("失败") ? "error" : "info");
    setToast({ id, title, message, tone: resolvedTone });
    toastTimerRef.current = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const activity = useMemo(() => deriveBookActivity(sse.messages, bookId), [bookId, sse.messages]);
  const writing = writeRequestPending || activity.writing;
  const drafting = draftRequestPending || activity.drafting;
  const latestPersistedChapter = data ? data.nextChapter - 1 : 0;

  useEffect(() => {
    const recent = sse.messages.at(-1);
    if (!recent) return;

    const data = recent.data as { bookId?: string } | null;
    if (data?.bookId !== bookId) return;

    if (recent.event === "write:start") {
      setWriteRequestPending(false);
      return;
    }

    if (recent.event === "draft:start") {
      setDraftRequestPending(false);
      return;
    }

    if (shouldRefetchBookView(recent, bookId)) {
      setWriteRequestPending(false);
      setDraftRequestPending(false);
      refetch();
    }
  }, [bookId, refetch, sse.messages]);

  const handleWriteNext = async () => {
    setWriteRequestPending(true);
    try {
      await postApi(`/books/${bookId}/write-next`);
    } catch (e) {
      setWriteRequestPending(false);
      notify(e instanceof Error ? e.message : "Failed", "操作失败");
    }
  };

  const handleDraft = async () => {
    setDraftRequestPending(true);
    try {
      await postApi(`/books/${bookId}/draft`);
    } catch (e) {
      setDraftRequestPending(false);
      notify(e instanceof Error ? e.message : "Failed", "操作失败");
    }
  };

  const handleToggleReviewMode = async () => {
    const next = reviewMode === "manual" ? "auto" : "manual";
    setReviewMode(next);
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}/chapter-review-mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
    } catch {
      setReviewMode(reviewMode); // revert on failure
    }
  };

  const handleDeleteBook = async () => {
    setConfirmDeleteOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/books/${bookId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `${res.status}`);
      }
      nav.toDashboard();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleRewrite = async (chapterNum: number) => {
    const isEn = data?.book.language === "en";
    const brief = await askText({
      title: isEn ? "Rewrite brief" : "重写补充说明",
      description: isEn
        ? "Optional brief for this run only. Leave blank to use the existing focus."
        : "可选：这次重写要遵循的补充想法。留空则沿用现有 focus。",
      placeholder: isEn ? "Leave blank to rewrite directly" : "留空直接重写",
    });
    if (brief === null) return;
    setRewritingChapters((prev) => [...prev, chapterNum]);
    try {
      await fetchJson(`/books/${bookId}/rewrite/${chapterNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() || undefined }),
      });
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Rewrite failed", "重写失败");
    } finally {
      setRewritingChapters((prev) => prev.filter((n) => n !== chapterNum));
    }
  };

  const handleRevise = async (chapterNum: number, mode: ReviseMode) => {
    const isEn = data?.book.language === "en";
    const brief = await askText({
      title: isEn ? "Revise brief" : "修订补充说明",
      description: isEn
        ? "Optional brief for this run only. Leave blank to use the existing focus."
        : "可选：这次修订要遵循的补充想法。留空则沿用现有 focus。",
      placeholder: isEn ? "Leave blank to revise directly" : "留空直接修订",
    });
    if (brief === null) return;
    // 默认走"安全闸门"：修订若没能减少复核问题就保留原稿。想无条件覆盖时选"强制覆盖"。
    const force = await askConfirm({
      title: isEn ? "Force overwrite?" : "是否强制覆盖？",
      message: isEn
        ? "Apply the revision even if it does not reduce the review issues?\n\nForce = overwrite regardless; Cancel = keep the original chapter when the revision does not improve."
        : "即使复核问题没有减少，也直接用它覆盖原章节吗？\n\n强制覆盖 = 无条件写入；取消 = 沿用安全策略（修订没变好就保留原稿）",
      confirmLabel: isEn ? "Force overwrite" : "强制覆盖",
    });
    setRevisingChapters((prev) => [...prev, chapterNum]);
    try {
      await fetchJson(`/books/${bookId}/revise/${chapterNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, brief: brief.trim() || undefined, force: force || undefined }),
      });
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Revision failed", "修订失败");
    } finally {
      setRevisingChapters((prev) => prev.filter((n) => n !== chapterNum));
    }
  };

  const handleSync = async (chapterNum: number) => {
    const isEn = data?.book.language === "en";
    const brief = await askText({
      title: isEn ? "Sync brief" : "同步补充说明",
      description: isEn
        ? "Optional brief for interpreting the edited chapter body. Leave blank to sync directly from the text."
        : "可选：这次同步时要遵循的补充说明。留空则直接按正文同步。",
      placeholder: isEn ? "Leave blank to sync directly" : "留空直接同步",
    });
    if (brief === null) return;
    setSyncingChapters((prev) => [...prev, chapterNum]);
    try {
      await fetchJson(`/books/${bookId}/resync/${chapterNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() || undefined }),
      });
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Sync failed", "同步失败");
    } finally {
      setSyncingChapters((prev) => prev.filter((n) => n !== chapterNum));
    }
  };

  const handleSaveSettings = async () => {
    if (!data) return;
    setSavingSettings(true);
    try {
      const body: Record<string, unknown> = {};
      if (settingsWordCount !== null) body.chapterWordCount = settingsWordCount;
      if (settingsTargetChapters !== null) body.targetChapters = settingsTargetChapters;
      if (settingsStatus !== null) body.status = settingsStatus;
      await fetchJson(`/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", "保存失败");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUnlock = async () => {
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}/unlock`, { method: "POST" });
      notify("已强制释放写入锁，可以继续编辑 / 修订。", "解锁成功");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unlock failed", "解锁失败");
    }
  };

  const handleDeleteChapter = async (chapterNum: number) => {
    const ok = await askConfirm({
      title: `删除第 ${chapterNum} 章？`,
      message: "只允许删除最新章节。正文会先保留到回收站，故事状态回滚到上一章。",
      confirmLabel: "删除",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}/chapters/${chapterNum}`, { method: "DELETE" });
      notify(`已删除第 ${chapterNum} 章。`, "删除成功");
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "删除失败");
    }
  };

  const handleApproveAll = async () => {
    if (!data) return;
    const reviewable = data.chapters.filter((ch) => ch.status === "ready-for-review");
    let failed = 0;
    for (const chapter of reviewable) {
      try {
        await postApi(`/books/${bookId}/chapters/${chapter.number}/approve`);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      notify(`${failed}/${reviewable.length} approve(s) failed`, "部分审核未通过");
    }
    refetch();
  };

  const runBookAction = async (key: string, action: () => Promise<string>) => {
    setBookActionPending(key);
    try {
      notify(await action());
      refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", "操作失败");
    } finally {
      setBookActionPending(null);
    }
  };

  const handleEvaluate = async () => {
    await runBookAction("eval", async () => {
      const result = await fetchJson<{
        qualityScore: number;
        totalChapters: number;
        totalWords: number;
        auditPassRate: number;
        avgAiTellDensity: number;
        hookResolveRate: number;
      }>(`/books/${bookId}/eval`);
      return [
        `${t("book.evaluate")}: ${result.qualityScore}/100`,
        `${t("dash.chapters")}: ${result.totalChapters}`,
        `${t("book.words")}: ${result.totalWords.toLocaleString()}`,
        `Audit: ${result.auditPassRate}%`,
        `AI tells: ${result.avgAiTellDensity}/1k`,
        `Hooks: ${result.hookResolveRate}%`,
      ].join("\n");
    });
  };

  const handleConsolidate = async () => {
    await runBookAction("consolidate", async () => {
      const result = await fetchJson<{ archivedVolumes?: number; retainedChapters?: number }>(`/books/${bookId}/consolidate`, {
        method: "POST",
      });
      return data?.book.language === "en"
        ? `Consolidated ${result.archivedVolumes ?? 0} volume(s). Retained ${result.retainedChapters ?? 0} recent chapter summaries.`
        : `已归并 ${result.archivedVolumes ?? 0} 个卷摘要，保留最近 ${result.retainedChapters ?? 0} 条章节摘要。`;
    });
  };

  const handleReviseFoundation = async () => {
    const isEn = data?.book.language === "en";
    const feedback = await askText({
      title: isEn ? "Revise foundation" : "重修基础设定",
      description: isEn
        ? "Feedback for the foundation revision. This rewrites the book foundation, not the chapter body."
        : "输入重修基础设定的反馈。此操作会重写基础设定，不直接改正文。",
      placeholder: isEn ? "e.g. strengthen the opening conflict" : "例如：强化开篇冲突、收紧世界观",
      confirmLabel: isEn ? "Revise" : "开始重修",
      requireValue: true,
    });
    if (feedback === null || !feedback.trim()) return;
    await runBookAction("revise-foundation", async () => {
      await fetchJson(`/books/${bookId}/foundation/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      return data?.book.language === "en" ? "Foundation revised." : "基础设定已重修。";
    });
  };

  const handlePlan = async () => {
    const isEn = data?.book.language === "en";
    const context = await askText({
      title: isEn ? "Plan next chapter" : "规划下一章",
      description: isEn ? "Optional planning context for the next chapter." : "可选：下一章规划补充说明。",
      placeholder: isEn ? "Leave blank to plan directly" : "留空直接规划",
    });
    if (context === null) return;
    await runBookAction("plan", async () => {
      const result = await fetchJson<{ chapterNumber?: number; title?: string }>(`/books/${bookId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: context.trim() || undefined }),
      });
      return data?.book.language === "en"
        ? `Planned chapter ${result.chapterNumber ?? "?"}: ${result.title ?? ""}`
        : `已计划第 ${result.chapterNumber ?? "?"} 章：${result.title ?? ""}`;
    });
  };

  const handleCompose = async () => {
    const isEn = data?.book.language === "en";
    const context = await askText({
      title: isEn ? "Compose next chapter" : "组装下一章",
      description: isEn ? "Optional compose context for the next chapter." : "可选：下一章组装补充说明。",
      placeholder: isEn ? "Leave blank to compose directly" : "留空直接组装",
    });
    if (context === null) return;
    await runBookAction("compose", async () => {
      const result = await fetchJson<{ chapterNumber?: number; title?: string }>(`/books/${bookId}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: context.trim() || undefined }),
      });
      return data?.book.language === "en"
        ? `Composed chapter ${result.chapterNumber ?? "?"}: ${result.title ?? ""}`
        : `已组装第 ${result.chapterNumber ?? "?"} 章：${result.title ?? ""}`;
    });
  };

  const handleRepairState = async (chapterNum: number) => {
    await runBookAction(`repair-state-${chapterNum}`, async () => {
      await fetchJson(`/books/${bookId}/repair-state/${chapterNum}`, { method: "POST" });
      return data?.book.language === "en" ? `Chapter ${chapterNum} state repaired.` : `第 ${chapterNum} 章状态已修复。`;
    });
  };

  if (loading) return <LoadingState label={t("common.loading")} />;

  if (error) return <ErrorState title={t("common.error")} message={error} className="m-8" />;
  if (!data) return null;

  const { book, chapters } = data;
  // Only the latest chapter may be deleted (middle deletion would orphan state).
  const latestChapterNumber = chapters.reduce((max, ch) => Math.max(max, ch.number), 0);
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount ?? 0), 0);
  const reviewCount = chapters.filter((ch) => ch.status === "ready-for-review").length;

  const currentWordCount = settingsWordCount ?? book.chapterWordCount;
  const currentTargetChapters = settingsTargetChapters ?? book.targetChapters ?? 0;
  const currentStatus = settingsStatus ?? (book.status as BookStatus);

  const exportHref = `/api/v1/books/${bookId}/export?format=${exportFormat}${exportApprovedOnly ? "&approvedOnly=true" : ""}`;

  return (
    <div className="space-y-8 fade-in">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <button
          onClick={nav.toDashboard}
          className="hover:text-primary transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={14} />
          {t("bread.books")}
        </button>
        <span className="text-border">/</span>
        <span className="text-foreground">{book.title}</span>
      </nav>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/40 pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-serif font-medium">{book.title}</h1>
            {book.language === "en" && (
              <span className="px-1.5 py-0.5 rounded border border-primary/20 text-primary text-[10px] font-bold">EN</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground font-medium">
            <span className="px-2 py-0.5 rounded bg-secondary/50 text-foreground/70 uppercase tracking-wider text-xs">{book.genre}</span>
            <div className="flex items-center gap-1.5">
              <FileText size={14} />
              <span>{chapters.length} {t("dash.chapters")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap size={14} />
              <span>{totalWords.toLocaleString()} {t("book.words")}</span>
            </div>
            {book.fanficMode && (
              <span className="flex items-center gap-1 text-primary">
                <Sparkles size={12} />
                <span className="italic">fanfic:{book.fanficMode}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleWriteNext}
            disabled={writing || drafting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {writing ? <div className="w-4 h-4 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" /> : <Zap size={16} />}
            {writing ? t("dash.writing") : t("book.writeNext")}
          </button>
          <button
            onClick={handleDraft}
            disabled={writing || drafting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-secondary text-foreground rounded-xl hover:bg-secondary/80 transition-all border border-border/50 disabled:opacity-50"
          >
            {drafting ? <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" /> : <Wand2 size={16} />}
            {drafting ? t("book.drafting") : t("book.draftOnly")}
          </button>
          <button
            onClick={handleToggleReviewMode}
            title={reviewMode === "manual"
              ? "手动审查：写完即停，由你点 审稿/修订/通过（更快、更可控）。点此切回自动。"
              : "自动审查：写完自动审校并按需重写（更省心，但更慢）。点此切到手动·写完即停。"}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-secondary/60 text-foreground rounded-xl border border-border/50 hover:bg-secondary transition-all"
          >
            {reviewMode === "manual" ? <Hand size={16} /> : <Settings2 size={16} />}
            {reviewMode === "manual" ? "审查：手动·写完即停" : "审查：自动"}
          </button>
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-destructive/10 text-destructive rounded-xl hover:bg-destructive hover:text-white transition-all border border-destructive/20 disabled:opacity-50"
          >
            {deleting ? <div className="w-4 h-4 border-2 border-destructive/20 border-t-destructive rounded-full animate-spin" /> : <Trash2 size={16} />}
            {deleting ? t("common.loading") : t("book.deleteBook")}
          </button>
        </div>
      </div>

      {(writing || drafting || activity.lastError) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            activity.lastError
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-primary/20 bg-primary/[0.04] text-foreground"
          }`}
        >
          {activity.lastError ? (
            <span>
              {t("book.pipelineFailed")}: {activity.lastError}
            </span>
          ) : writing ? (
            <span>{t("book.pipelineWriting")}</span>
          ) : (
            <span>{t("book.pipelineDrafting")}</span>
          )}
        </div>
      )}

      {/* Tool Strip */}
      <div className="flex flex-wrap items-center gap-2 py-1">
          {reviewCount > 0 && (
            <button
              onClick={handleApproveAll}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-success-soft text-success rounded-lg hover:bg-success-soft transition-all border border-success/30"
            >
              <CheckCheck size={14} />
              {t("book.approveAll")} ({reviewCount})
            </button>
          )}
          <button
            onClick={() => nav.toTruth(bookId)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50"
          >
            <Database size={14} />
            {t("book.truthFiles")}
          </button>
          <button
            onClick={() => nav.toAnalytics(bookId)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50"
          >
            <BarChart2 size={14} />
            {t("book.analytics")}
          </button>
          <button
            onClick={handleEvaluate}
            disabled={bookActionPending === "eval"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50 disabled:opacity-50"
          >
            <Search size={14} />
            {bookActionPending === "eval" ? t("common.loading") : t("book.evaluate")}
          </button>
          <button
            onClick={handleConsolidate}
            disabled={bookActionPending === "consolidate"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50 disabled:opacity-50"
          >
            <Database size={14} />
            {bookActionPending === "consolidate" ? t("common.loading") : t("book.consolidate")}
          </button>
          <button
            onClick={handleReviseFoundation}
            disabled={bookActionPending === "revise-foundation"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {bookActionPending === "revise-foundation" ? t("common.loading") : t("book.reviseFoundation")}
          </button>
          <button
            onClick={handlePlan}
            disabled={bookActionPending === "plan"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50 disabled:opacity-50"
          >
            <FileText size={14} />
            {bookActionPending === "plan" ? t("common.loading") : t("book.planNext")}
          </button>
          <button
            onClick={handleCompose}
            disabled={bookActionPending === "compose"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50 disabled:opacity-50"
          >
            <Wand2 size={14} />
            {bookActionPending === "compose" ? t("common.loading") : t("book.composeNext")}
          </button>
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="px-2 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg border border-border/50 outline-none"
            >
              <option value="txt">TXT</option>
              <option value="md">MD</option>
              <option value="epub">EPUB</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportApprovedOnly}
                onChange={(e) => setExportApprovedOnly(e.target.checked)}
                className="rounded border-border/50"
              />
              {t("book.approvedOnly")}
            </label>
            <button
              onClick={async () => {
                try {
                  const data = await fetchJson<{ path?: string; chapters?: number }>(`/books/${bookId}/export-save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ format: exportFormat, approvedOnly: exportApprovedOnly }),
                  });
                  notify(`${t("common.exportSuccess")}\n${data.path}\n(${data.chapters} ${t("dash.chapters")})`, "导出完成");
                } catch (e) {
                  notify(e instanceof Error ? e.message : "Export failed", "导出失败");
                }
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50"
            >
              <Download size={14} />
              {t("book.export")}
            </button>
          </div>
      </div>

      {/* Book Materials — model-collected research library, grouped by facet */}
      <div className="paper-sheet rounded-2xl border border-border/40 shadow-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">资料库</h2>
          <button
            type="button"
            onClick={loadMaterials}
            className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/50 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            title="重新读取资料"
          >
            <RefreshCw size={12} />
            刷新
          </button>
        </div>
        {materialFacets.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            还没有资料。在对话里让助手整理某一类资料（人物 / 制度 / 地图 / 财务 …），保存后会按分类出现在这里。
          </p>
        ) : (
          <div className="space-y-4">
            {materialFacets.map((group) => (
              <div key={group.facet}>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-primary">{group.facet}</div>
                <div className="space-y-1.5">
                  {group.entries.map((entry) => {
                    const key = `${entry.facet}/${entry.name}`;
                    return (
                      <div key={entry.path}>
                        <button
                          type="button"
                          onClick={() => void openMaterial(entry.facet, entry.name)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-secondary/60"
                        >
                          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{entry.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{entry.charCount} 字</span>
                        </button>
                        {openMaterialKey === key && (
                          <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-[12px] leading-6 text-foreground">
                            {materialContent ?? "读取中…"}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Book Settings */}
      <div className="paper-sheet rounded-2xl border border-border/40 shadow-sm p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">{t("book.settings")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("create.wordsPerChapter")}</label>
            <input
              type="number"
              value={currentWordCount}
              onChange={(e) => setSettingsWordCount(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border border-border/50 bg-secondary/30 outline-none focus:border-primary/50 w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("create.targetChapters")}</label>
            <input
              type="number"
              value={currentTargetChapters}
              onChange={(e) => setSettingsTargetChapters(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border border-border/50 bg-secondary/30 outline-none focus:border-primary/50 w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("book.status")}</label>
            <select
              value={currentStatus}
              onChange={(e) => setSettingsStatus(e.target.value as BookStatus)}
              className="px-3 py-2 text-sm rounded-lg border border-border/50 bg-secondary/30 outline-none focus:border-primary/50"
            >
              <option value="active">{t("book.statusActive")}</option>
              <option value="paused">{t("book.statusPaused")}</option>
              <option value="outlining">{t("book.statusOutlining")}</option>
              <option value="completed">{t("book.statusCompleted")}</option>
              <option value="dropped">{t("book.statusDropped")}</option>
            </select>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {savingSettings ? <div className="w-4 h-4 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" /> : <Save size={14} />}
            {savingSettings ? t("book.saving") : t("book.save")}
          </button>
          <button
            type="button"
            onClick={handleUnlock}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-secondary/50 text-muted-foreground rounded-lg hover:text-foreground hover:bg-secondary transition-all border border-border/50"
            title="当一直提示“作品被锁定/写入进行中”且任务已停止时，用它强制释放写入锁"
          >
            <RotateCcw size={14} />
            强制解锁
          </button>
        </div>
      </div>

      {/* Chapters Table */}
      <div className="paper-sheet rounded-2xl overflow-hidden border border-border/40 shadow-xl shadow-primary/5">
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-1 bg-secondary/80 backdrop-blur-sm">
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="text-left px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-muted-foreground w-16">#</th>
                <th className="text-left px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-muted-foreground">{t("book.manuscriptTitle")}</th>
                <th className="text-left px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-muted-foreground w-28">{t("book.words")}</th>
                <th className="text-left px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-muted-foreground w-36">{t("book.status")}</th>
                <th className="text-right px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-muted-foreground">{t("book.curate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {chapters.map((ch, index) => {
                const staggerClass = `stagger-${Math.min(index + 1, 5)}`;
                return (
                <tr key={ch.number} className={`group hover:bg-primary/[0.02] transition-colors fade-in ${staggerClass}`}>
                  <td className="px-6 py-4 text-muted-foreground/60 font-mono text-xs">{ch.number.toString().padStart(2, '0')}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => nav.toChapter(bookId, ch.number)}
                      className="font-serif text-lg font-medium hover:text-primary transition-colors text-left"
                    >
                      {ch.title || t("chapter.label").replace("{n}", String(ch.number))}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-medium tabular-nums text-xs">{(ch.wordCount ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${STATUS_CONFIG[ch.status]?.color ?? "bg-muted text-muted-foreground"}`}>
                      {STATUS_CONFIG[ch.status]?.icon}
                      {translateChapterStatus(ch.status, t)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {ch.status === "ready-for-review" && (
                        <>
                          <button
                            onClick={async () => {
                              try { await postApi(`/books/${bookId}/chapters/${ch.number}/approve`); refetch(); }
                              catch (e) { notify(e instanceof Error ? e.message : "Approve failed", "通过失败"); }
                            }}
                            className="p-2 rounded-lg bg-success-soft text-success hover:bg-success hover:text-white transition-all shadow-sm"
                            title={t("book.approve")}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              try { await postApi(`/books/${bookId}/chapters/${ch.number}/reject`); refetch(); }
                              catch (e) { notify(e instanceof Error ? e.message : "Reject failed", "驳回失败"); }
                            }}
                            className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all shadow-sm"
                            title={t("book.reject")}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            const auditResult = await fetchJson<{ passed?: boolean; issues?: unknown[] }>(`/books/${bookId}/audit/${ch.number}`, { method: "POST" });
                            notify(
                              auditResult.passed ? "审核通过" : `审核未通过：${auditResult.issues?.length ?? 0} 条问题`,
                              "审核结果",
                            );
                            refetch();
                          } catch (e) {
                            notify(e instanceof Error ? e.message : "Audit failed", "审核失败");
                          }
                        }}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shadow-sm"
                        title={t("book.audit")}
                      >
                        <ShieldCheck size={14} />
                      </button>
                      <button
                        onClick={() => handleRewrite(ch.number)}
                        disabled={rewritingChapters.includes(ch.number)}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shadow-sm disabled:opacity-50"
                        title={t("book.rewrite")}
                      >
                        {rewritingChapters.includes(ch.number)
                          ? <div className="w-3.5 h-3.5 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                          : <RotateCcw size={14} />}
                      </button>
                      <button
                        onClick={() => handleSync(ch.number)}
                        disabled={syncingChapters.includes(ch.number) || ch.number !== latestPersistedChapter}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shadow-sm disabled:opacity-50"
                        title={data?.book.language === "en" ? "Sync truth/state from edited chapter" : "根据已编辑章节同步 truth/state"}
                      >
                        {syncingChapters.includes(ch.number)
                          ? <div className="w-3.5 h-3.5 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                          : <RefreshCw size={14} />}
                      </button>
                      {ch.status === "state-degraded" && (
                        <button
                          onClick={() => handleRepairState(ch.number)}
                          disabled={bookActionPending === `repair-state-${ch.number}`}
                          className="p-2 rounded-lg bg-warning-soft text-warning hover:bg-warning hover:text-white transition-all shadow-sm disabled:opacity-50"
                          title={t("book.repairState")}
                        >
                          {bookActionPending === `repair-state-${ch.number}`
                            ? <div className="w-3.5 h-3.5 border-2 border-warning/35 border-t-amber-600 rounded-full animate-spin" />
                            : <Settings2 size={14} />}
                        </button>
                      )}
                      <select
                        disabled={revisingChapters.includes(ch.number)}
                        value=""
                        onChange={(e) => {
                          const mode = e.target.value as ReviseMode;
                          if (mode) handleRevise(ch.number, mode);
                        }}
                        className="px-2 py-1.5 text-[11px] font-bold rounded-lg bg-secondary text-muted-foreground border border-border/50 outline-none hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50 cursor-pointer"
                        title="Revise with AI"
                      >
                        <option value="" disabled>{revisingChapters.includes(ch.number) ? t("common.loading") : t("book.curate")}</option>
                        <option value="spot-fix">{t("book.spotFix")}</option>
                        <option value="polish">{t("book.polish")}</option>
                        <option value="rewrite">{t("book.rewrite")}</option>
                        <option value="rework">{t("book.rework")}</option>
                        <option value="anti-detect">{t("book.antiDetect")}</option>
                      </select>
                      {ch.number === latestChapterNumber && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteChapter(ch.number)}
                          className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all shadow-sm"
                          title="删除本章（仅允许删除最新章，正文会先保留到回收站）"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {chapters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
               <FileText size={20} className="text-muted-foreground/40" />
            </div>
            <p className="text-sm italic font-serif text-muted-foreground">
              {t("book.noChapters")}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t("book.deleteBook")}
        message={t("book.confirmDelete")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleDeleteBook}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {/* In-app replacements for window.prompt / window.confirm / alert */}
      <PromptDialog
        open={promptCfg !== null}
        title={promptCfg?.title ?? ""}
        description={promptCfg?.description}
        placeholder={promptCfg?.placeholder}
        confirmLabel={promptCfg?.confirmLabel ?? t("common.confirm")}
        cancelLabel={t("common.cancel")}
        requireValue={promptCfg?.requireValue}
        onConfirm={(value) => closePrompt(value)}
        onCancel={() => closePrompt(null)}
      />
      <ConfirmDialog
        open={askState !== null}
        title={askState?.title ?? ""}
        message={askState?.message ?? ""}
        confirmLabel={askState?.confirmLabel ?? t("common.confirm")}
        cancelLabel={t("common.cancel")}
        variant={askState?.variant ?? "default"}
        onConfirm={() => closeAsk(true)}
        onCancel={() => closeAsk(false)}
      />
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md max-w-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${
            toast.tone === "ok"
              ? "border-emerald-500/40 bg-card/95 text-foreground dark:bg-card/90"
              : toast.tone === "error"
              ? "border-destructive/40 bg-destructive/15 text-destructive"
              : "border-border/60 bg-card/95 text-foreground"
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {toast.tone === "ok" ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : toast.tone === "error" ? (
              <AlertCircle size={16} />
            ) : (
              <Info size={16} className="text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-none">{toast.title}</div>
            <div className="mt-1 text-xs opacity-90 break-words leading-relaxed whitespace-pre-line">{toast.message}</div>
          </div>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setToast(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
