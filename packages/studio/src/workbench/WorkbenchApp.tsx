/**
 * Novel Creation workbench shell.
 *
 * Owns the area navigation, the book context strip, the demo-data flag and the
 * toast region. It is deliberately host-agnostic: the Studio route passes
 * `area`/`onAreaChange`, and the standalone preview does the same from its own
 * hash router, so both mount one single implementation.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FlaskConical,
  GitCompare,
  ListTree,
  Menu,
  Moon,
  PenLine,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
} from "lucide-react";
import type { WorkbenchArea } from "./types";
import { WORKBENCH_AREAS } from "./areas";
import { useWorkbench } from "./state/store";
import { BookList } from "./pages/BookList";
import { WritingWorkspace } from "./pages/WritingWorkspace";
import { OutlineContract } from "./pages/OutlineContract";
import { ReviewView } from "./pages/ReviewView";
import { CompareView } from "./pages/CompareView";
import { CommitView } from "./pages/CommitView";
import { TaskCenter } from "./pages/TaskCenter";
import { Research } from "./pages/Research";
import { Analytics } from "./pages/Analytics";
import { Export } from "./pages/Export";
import { SettingsAbout } from "./pages/SettingsAbout";
import { TransitionDialog } from "./components/TransitionDialog";
import { Alert, Badge, DemoFlag, IconButton, Skeleton, ToastStack } from "./ui";
import { reviewCounts } from "./components/ReviewPanel";
import "./theme.css";
import "./workbench.css";

const AREA_META: Record<WorkbenchArea, { label: string; icon: ReactNode; group: string }> = {
  books: { label: "作品列表", icon: <BookOpen size={15} />, group: "创作" },
  writing: { label: "写作工作区", icon: <PenLine size={15} />, group: "创作" },
  outline: { label: "细纲与合同", icon: <ListTree size={15} />, group: "创作" },
  review: { label: "审核视图", icon: <ShieldAlert size={15} />, group: "治理" },
  compare: { label: "版本比较", icon: <GitCompare size={15} />, group: "治理" },
  commit: { label: "提交确认", icon: <ClipboardCheck size={15} />, group: "治理" },
  tasks: { label: "任务中心", icon: <Activity size={15} />, group: "运行" },
  research: { label: "研究与分析", icon: <FlaskConical size={15} />, group: "运行" },
  analytics: { label: "连载分析", icon: <Activity size={15} />, group: "洞察" },
  export: { label: "导出", icon: <Download size={15} />, group: "交付" },
  settings: { label: "设置与关于", icon: <SettingsIcon size={15} />, group: "运行" },
};

const AREA_ORDER: readonly WorkbenchArea[] = WORKBENCH_AREAS;

export interface WorkbenchAppProps {
  readonly area: WorkbenchArea;
  /** Updates the host route atomically with its optional current-book context. */
  readonly onAreaChange: (area: WorkbenchArea, bookId?: string) => void;
  readonly theme?: "light" | "dark";
  readonly onToggleTheme?: () => void;
  readonly onOpenModelConfig?: () => void;
  /** Book context carried by the host route, so a deep link selects it. */
  readonly bookId?: string;
  readonly language?: "zh" | "en";
  readonly onLanguageChange?: (language: "zh" | "en") => void | Promise<void>;
  readonly onToggleSidebar?: () => void;
  readonly onCreateBook?: () => void;
  readonly onImportBook?: () => void;
  /**
   * Host-owned pages that already exist in the Studio shell. The workbench is
   * the chapter-production surface, not a second home for global assets, so when
   * embedded it delegates these areas to the host instead of rendering a rival
   * copy of the same page. The standalone preview, which has no host, still
   * renders its own pages.
   */
  readonly onOpenAnalytics?: (bookId?: string) => void;
  readonly onOpenResearch?: () => void;
  /** Whether to hide the inner rail when embedded inside the host's unified sidebar. */
  readonly standalone?: boolean;
  /**
   * Server event stream from the host.
   *
   * The workbench reloads the affected surface when another tab, the CLI or a
   * background generation changes the book it is showing. The standalone preview
   * has no host stream and therefore does not live-update.
   */
  readonly events?: ReadonlyArray<{ readonly event: string; readonly data: unknown; readonly seq: number }>;
}

export function WorkbenchApp({
  area,
  onAreaChange,
  theme = "light",
  onToggleTheme,
  onOpenModelConfig,
  bookId,
  language,
  onLanguageChange,
  onToggleSidebar,
  onCreateBook,
  onImportBook,
  onOpenAnalytics,
  onOpenResearch,
  events,
  standalone = false,
}: WorkbenchAppProps) {
  const load = useWorkbench((state) => state.load);
  const loadState = useWorkbench((state) => state.loadState);
  const loadError = useWorkbench((state) => state.loadError);
  const dataset = useWorkbench((state) => state.dataset);
  const demoMode = useWorkbench((state) => state.demoMode);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const selectBook = useWorkbench((state) => state.selectBook);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const setArea = useWorkbench((state) => state.setArea);
  const setNavigator = useWorkbench((state) => state.setNavigator);
  const requestTransition = useWorkbench((state) => state.requestTransition);
  const handleServerEvent = useWorkbench((state) => state.handleServerEvent);
  const [navCollapsed, setNavCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768,
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Apply server-side changes to the surface they affect. Keyed on `seq` so a
  // re-render with the same buffer does not replay events.
  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!events || events.length === 0) return;
    const fresh = events.filter((entry) => entry.seq > lastSeqRef.current);
    if (fresh.length === 0) return;
    lastSeqRef.current = Math.max(...fresh.map((entry) => entry.seq));
    for (const entry of fresh) handleServerEvent(entry.event, entry.data);
  }, [events, handleServerEvent]);

  // Keep the store's area in step with the host route, whichever drives it.
  useEffect(() => {
    setArea(area);
  }, [area, setArea]);

  // Let inner pages (定位原文, 处理恢复) change area through the same route.
  useEffect(() => {
    setNavigator((nextArea) => onAreaChange(nextArea, activeBookId ?? undefined));
    return () => setNavigator(null);
  }, [activeBookId, onAreaChange, setNavigator]);

  // Honor the route's book context. Guarded so the selector's own write-back
  // cannot bounce back into another sync.
  useEffect(() => {
    if (!bookId || !dataset) return;
    if (bookId === activeBookId) return;
    if (!dataset.books.some((book) => book.id === bookId)) return;
    selectBook(bookId);
  }, [bookId, activeBookId, dataset, selectBook]);

  const counts = useMemo(() => reviewCounts(dataset?.reviewItems ?? []), [dataset]);
  const openReview = counts.block + counts.warn + counts.suggest;

  const areaCounts: Partial<Record<WorkbenchArea, number>> = {
    review: openReview,
    tasks: dataset?.tasks.filter((task) => task.state === "queued" || task.state === "running" || task.state === "awaiting").length,
  };

  const go = (next: WorkbenchArea, nextBookId = activeBookId ?? undefined) => {
    // Host-owned pages first: global assets live in one place, so hand these
    // areas back to the Studio shell instead of showing a duplicate page.
    const delegating = !standalone && (
      (next === "analytics" && !!onOpenAnalytics && !!activeBookId)
      || (next === "research" && !!onOpenResearch)
    );
    // Every area change goes through the guard so leaving the workspace cannot
    // discard unsaved prose, whichever control triggered it.
    void requestTransition(`切换到「${AREA_META[next].label}」`, () => {
      if (delegating) {
        const currentBook = activeBookId ?? undefined;
        if (next === "analytics" && onOpenAnalytics && currentBook) {
          onOpenAnalytics(currentBook);
          return;
        }
        if (next === "research" && onOpenResearch) {
          onOpenResearch();
          return;
        }
      }
      setArea(next);
      onAreaChange(next, nextBookId);
    });
  };

  const activeBook = dataset?.books.find((book) => book.id === activeBookId) ?? null;
  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const activeChapter = bookChapters.find((chapter) => chapter.id === activeChapterId) ?? null;

  let page: ReactNode;
  if (loadState === "loading" && !dataset) {
    page = <div className="nc-page-body"><Skeleton rows={6} label="正在载入工作台数据" /></div>;
  } else if (loadState === "error") {
    page = (
      <div className="nc-page-body">
        <Alert tone="block" title="工作台数据读取失败">
          <span>{loadError ?? "未知错误。"}</span>
          <span className="nc-btn-group" style={{ marginTop: 8 }}>
            <button type="button" className="nc-btn" onClick={() => void load()}>重试</button>
          </span>
        </Alert>
      </div>
    );
  } else if (area === "books") {
    page = (
      <BookList
        books={dataset?.books ?? []}
        loadState={loadState}
        loadError={loadError}
        onRetry={() => void load()}
        onOpen={(nextBookId) => { selectBook(nextBookId); go("writing", nextBookId); }}
        onOpenOutline={(nextBookId) => { selectBook(nextBookId); go("outline", nextBookId); }}
        onOpenReview={(nextBookId) => { selectBook(nextBookId); go("review", nextBookId); }}
        onNew={onCreateBook ?? (() => go("books"))}
        onImport={onImportBook ?? (() => go("books"))}
      />
    );
  } else if (area === "writing") {
    page = <WritingWorkspace onOpenArea={go} />;
  } else if (area === "outline") {
    page = <OutlineContract />;
  } else if (area === "review") {
    page = <ReviewView />;
  } else if (area === "compare") {
    page = <CompareView />;
  } else if (area === "commit") {
    page = <CommitView />;
  } else if (area === "tasks") {
    page = <TaskCenter />;
  } else if (area === "research") {
    page = <Research />;
  } else if (area === "analytics") {
    page = <Analytics />;
  } else if (area === "export") {
    page = <Export />;
  } else {
    page = <SettingsAbout theme={theme} onToggleTheme={onToggleTheme ?? (() => {})} onOpenModelConfig={onOpenModelConfig} />;
  }

  const groups = Array.from(new Set(AREA_ORDER.map((item) => AREA_META[item].group)));

  return (
    <div className="nc-root" data-area={area}>
      {standalone && (
        <nav className="nc-nav" data-collapsed={navCollapsed} aria-label="工作台导航">
          <button
            type="button"
            className="nc-brand"
            onClick={() => go("writing")}
            title="Novel Creation"
          >
            <span className="nc-brand-mark" aria-hidden="true">N</span>
            <span className="nc-brand-text">
              <span className="nc-brand-name">Novel Creation</span>
              <span className="nc-brand-sub">Workbench</span>
            </span>
          </button>

          {groups.map((group) => (
            <div className="nc-nav-group" key={group}>
              <div className="nc-nav-group-label">{group}</div>
              {AREA_ORDER.filter((item) => AREA_META[item].group === group).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="nc-nav-item"
                  aria-current={area === item ? "page" : undefined}
                  aria-label={AREA_META[item].label}
                  onClick={() => go(item)}
                  title={navCollapsed ? AREA_META[item].label : undefined}
                >
                  <span className="nc-nav-icon" aria-hidden="true">{AREA_META[item].icon}</span>
                  <span className="nc-nav-label">{AREA_META[item].label}</span>
                  {areaCounts[item] ? <span className="nc-nav-count">{areaCounts[item]}</span> : null}
                </button>
              ))}
            </div>
          ))}

          <div className="nc-nav-foot">
            <button
              type="button"
              className="nc-nav-item"
              onClick={() => setNavCollapsed((value) => !value)}
              title={navCollapsed ? "展开导航" : "收起导航"}
            >
              <span className="nc-nav-icon" aria-hidden="true">
                {navCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </span>
              <span className="nc-nav-label">收起导航</span>
            </button>
          </div>
        </nav>
      )}

      <div className="nc-main">
        <header className="nc-topbar">
          <div className="nc-topbar-context">
            {onToggleSidebar && (
              <button
                type="button"
                className="nc-mobile-menu"
                onClick={onToggleSidebar}
                aria-label="打开导航"
                title="打开导航"
              >
                <Menu size={17} aria-hidden="true" />
              </button>
            )}
            <span className="nc-label nc-crumbs-hide-sm">Novel Creation</span>
            <span className="nc-crumb-sep nc-crumbs-hide-sm" aria-hidden="true">/</span>
            <span className="nc-em nc-area-title">{AREA_META[area].label}</span>

            {dataset && dataset.books.length > 0 && (
              <>
                <span className="nc-crumb-sep nc-book-sep" aria-hidden="true">·</span>
                <label className="nc-visually-hidden" htmlFor="nc-book-select">当前作品</label>
                <select
                  id="nc-book-select"
                  className="nc-select"
                  style={{ width: "auto", maxWidth: 200 }}
                  value={activeBookId ?? ""}
                  onChange={(event) => {
                    selectBook(event.target.value);
                    onAreaChange(area, event.target.value);
                  }}
                >
                  {dataset.books.map((book) => (
                    <option key={book.id} value={book.id}>{book.title}</option>
                  ))}
                </select>
                {bookChapters.length > 0 && (
                  <>
                    <span className="nc-crumb-sep nc-book-sep" aria-hidden="true">·</span>
                    <label className="nc-visually-hidden" htmlFor="nc-chapter-select">当前章节</label>
                    <select
                      id="nc-chapter-select"
                      className="nc-select"
                      style={{ width: "auto", maxWidth: 220 }}
                      value={activeChapterId ?? ""}
                      onChange={(event) => {
                        void selectChapter(event.target.value);
                      }}
                      title="切换当前章节"
                    >
                      {bookChapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          第 {ch.number} 章 · {ch.title}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
          </div>

          <div className="nc-topbar-actions">
            {demoMode && <DemoFlag />}
            {counts.block > 0 && <Badge tone="block" title="存在未处理的阻断项">阻断 {counts.block}</Badge>}
            {language && onLanguageChange && (
              <div className="nc-lang-toggle" role="group" aria-label="界面语言">
                <button
                  type="button"
                  aria-pressed={language === "zh"}
                  onClick={() => void onLanguageChange("zh")}
                >
                  中
                </button>
                <button
                  type="button"
                  aria-pressed={language === "en"}
                  onClick={() => void onLanguageChange("en")}
                >
                  EN
                </button>
              </div>
            )}
            {onToggleTheme && (
              <IconButton
                label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                onClick={onToggleTheme}
              />
            )}
          </div>
        </header>

        <div className="nc-page">{page}</div>
      </div>

      <ToastStack />
      <TransitionDialog />
    </div>
  );
}


