import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useHashRoute } from "./hooks/use-hash-route";
import type { HashRoute } from "./hooks/use-hash-route";
import { Sidebar } from "./components/Sidebar";
import { NovelCreationLogo } from "./components/NovelCreationLogo";
import { Button } from "./components/ui/button";
import { Dashboard } from "./pages/Dashboard";
import { ChatPage } from "./pages/ChatPage";
import { BookDetail } from "./pages/BookDetail";
import { ChapterReader } from "./pages/ChapterReader";
import { Analytics } from "./pages/Analytics";
import { ServiceListPage } from "./pages/ServiceListPage";
import { ServiceDetailPage } from "./pages/ServiceDetailPage";
import { ProjectSettings } from "./pages/ProjectSettings";
import { TruthFiles } from "./pages/TruthFiles";
import { DaemonControl } from "./pages/DaemonControl";
import { LogViewer } from "./pages/LogViewer";
import { GenreManager } from "./pages/GenreManager";
import { StyleManager } from "./pages/StyleManager";
import { TranslationManager } from "./pages/TranslationManager";
import { ImportManager } from "./pages/ImportManager";
import { RadarView } from "./pages/RadarView";
import { DoctorView } from "./pages/DoctorView";
import { StoryPlayer } from "./pages/StoryPlayer";
import { StoryGraphTree } from "./pages/StoryGraphTree";
const FlowView = lazy(() => import("./pages/FlowView"));
const FilmWizard = lazy(() => import("./pages/FilmWizard"));
import { LanguageSelector } from "./pages/LanguageSelector";
import { WorkbenchApp } from "./workbench";
import { useWorkbench as useWorkbenchStore } from "./workbench/state/store";
import { DEFAULT_WORKBENCH_AREA } from "./workbench/areas";
import type { WorkbenchArea } from "./workbench";
import { BookSidebar, BookSidebarToggle } from "./components/chat/BookSidebar";
import { useSSE } from "./hooks/use-sse";
import { useSessionEvents } from "./hooks/use-session-events";
import { useTheme } from "./hooks/use-theme";
import { useI18n } from "./hooks/use-i18n";
import { setAppLanguage, tr } from "./lib/app-language";
import { postApi, putApi, useApi } from "./hooks/use-api";
import { Sun, Moon, Menu } from "lucide-react";
import { House } from "lucide-react";

export type { HashRoute as Route } from "./hooks/use-hash-route";

export function deriveActiveBookId(route: HashRoute): string | undefined {
  // The workbench carries its own book context; it must not be treated as a
  // book-centreed route or the sidebar highlight and page id drift.
  if (route.page === "workbench") return undefined;
  if ("bookId" in route) return route.bookId;
  return undefined;
}

export function isBookCreateChatRoute(
  route: HashRoute,
): route is Extract<HashRoute, { page: "book-create" }> {
  return route.page === "book-create";
}

export function deriveStartupGate(input: {
  readonly ready: boolean;
  readonly projectError: string | null;
}): "ready" | "loading" | "error" {
  if (input.ready) return "ready";
  return input.projectError ? "error" : "loading";
}

export function App() {
  const { route, setRoute } = useHashRoute();
  const sse = useSSE();
  const { theme, setTheme } = useTheme();
  const { t, lang: currentLang } = useI18n();
  const { data: project, error: projectError, refetch: refetchProject } = useApi<{ language: string; languageExplicit: boolean }>("/project");
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isDark = theme === "dark";

  // 全局语言同步：app-language 是模块级单例，供用不了 hook 的代码（lib 纯函数、
  // store slice）读取。这里在渲染期同步赋值，让子组件在同一次渲染里调用 tr() 时
  // 就读到正确语言（只用 effect 的话，effect 要等本次渲染提交后才执行，本次渲染
  // 里的 tr() 会读到旧语言）。赋值是幂等的模块变量写入，StrictMode 重复渲染无影
  // 响；下面的 effect 在语言加载完成和切换时再设置一次，保证提交后的值也正确。
  setAppLanguage(currentLang);
  useEffect(() => {
    setAppLanguage(currentLang);
  }, [currentLang]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // On compact screens navigation is a drawer. A completed route change closes
  // it so the newly selected workspace is immediately usable.
  useEffect(() => {
    setSidebarOpen(false);
  }, [route]);

  useEffect(() => {
    if (project) {
      if (!project.languageExplicit) {
        setShowLanguageSelector(true);
      }
      setReady(true);
    }
  }, [project]);

  useSessionEvents(sse, route, setRoute);

  /**
   * Route changes that leave the workspace unmount the editor. When the
   * workbench holds unsaved prose, the store parks the move and shows a
   * confirmation instead of discarding it — `beforeunload` only ever covered
   * closing the tab, not in-app navigation.
   */
  const guardWorkbenchExit = (run: () => void) => {
    if (route.page !== "workbench") {
      run();
      return;
    }
    const { requestTransition } = useWorkbenchStore.getState();
    void requestTransition("离开写作工作区", run);
  };

  const nav = {
    toDashboard: () => guardWorkbenchExit(() => setRoute({ page: "dashboard" })),
    toWorkbench: (area: WorkbenchArea = DEFAULT_WORKBENCH_AREA, bookId?: string) =>
      guardWorkbenchExit(() => setRoute({ page: "workbench", area, ...(bookId ? { bookId } : {}) })),
    toChat: () => setRoute({ page: "chat" }),
    toBook: (bookId: string) => setRoute({ page: "book", bookId }),
    toBookSettings: (bookId: string) => setRoute({ page: "book-settings", bookId }),
    toBookCreate: (genre?: string) => setRoute({ page: "book-create", ...(genre ? { genre } : {}) }),
    toChapter: (bookId: string, chapterNumber: number) =>
      setRoute({ page: "chapter", bookId, chapterNumber }),
    toAnalytics: (bookId: string) => setRoute({ page: "analytics", bookId }),
    toServices: () => setRoute({ page: "services" }),
    toProjectSettings: () => setRoute({ page: "project-settings" }),
    toServiceDetail: (id: string) => setRoute({ page: "service-detail", serviceId: id }),
    toTruth: (bookId: string) => setRoute({ page: "truth", bookId }),
    toDaemon: () => setRoute({ page: "daemon" }),
    toLogs: () => setRoute({ page: "logs" }),
    toGenres: () => setRoute({ page: "genres" }),
    toStyle: () => setRoute({ page: "style" }),
    toTranslation: () => setRoute({ page: "translation" }),
    toImport: (tab?: "chapters" | "canon" | "fanfic" | "spinoff" | "imitation") => setRoute({ page: "import", ...(tab ? { tab } : {}) }),
    toRadar: () => setRoute({ page: "radar" }),
    toDoctor: () => setRoute({ page: "doctor" }),
    toPlay: (projectId: string) => setRoute({ page: "play", projectId }),
    toFilm: (projectId: string) => setRoute({ page: "film", projectId }),
    toFlow: (projectId: string) => setRoute({ page: "flow", projectId }),
    toFilmAuthor: (projectId: string) => setRoute({ page: "film-author", projectId }),
    toFilmStudio: (projectId: string) => setRoute({ page: "film-studio", projectId }),
  };

  // HashRoute is a discriminated union: `bookId` and `area` only exist on the
  // workbench member, so the context is narrowed once here instead of reading
  // them off the whole union inside the callbacks.
  const workbenchBookId = route.page === "workbench" ? route.bookId : undefined;
  const workbenchArea = route.page === "workbench" ? route.area : undefined;

  // Stable workbench callbacks: the workbench syncs its book context through
  // them, so they must not be recreated on every render.
  const goWorkbenchArea = useCallback(
    (area: WorkbenchArea, bookId?: string) =>
      setRoute({ page: "workbench", area, ...((bookId ?? workbenchBookId) ? { bookId: bookId ?? workbenchBookId } : {}) }),
    [workbenchBookId, setRoute],
  );

  const changeLanguage = useCallback(async (language: "zh" | "en") => {
    await putApi("/project", { language });
    refetchProject();
  }, [refetchProject]);

  const activeBookId = deriveActiveBookId(route);
  const activePage =
    activeBookId
      ? `book:${activeBookId}`
      : route.page === "workbench"
        ? "workbench"
        : route.page === "service-detail"
          ? "services"
          : route.page;

  const startupGate = deriveStartupGate({ ready, projectError });

  if (startupGate === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] border border-destructive/35 bg-block-soft p-6 shadow-(--nc-shadow-2)">
          <div>
            <h1 className="text-lg font-semibold text-destructive">
              无法加载项目配置 / Failed to load project config
            </h1>
            <p className="mt-2 text-sm break-all text-muted-foreground">{projectError}</p>
          </div>
          {/* 项目配置没加载出来，语言未知，所以这屏中英双语并排展示。 */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            请检查项目配置文件是否存在且为合法 JSON，然后重试。
            <br />
            Check that the project configuration file exists and is valid JSON, then retry.
          </p>
          <Button onClick={() => refetchProject()}>重试 / Retry</Button>
        </div>
      </div>
    );
  }

  if (startupGate === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <NovelCreationLogo className="h-12 w-12" />
          <div className="flex flex-col">
            <span className="font-serif text-2xl leading-none italic">Novel</span>
            <span className="mt-1.5 text-[12px] font-bold text-muted-foreground uppercase">
              Creation
            </span>
          </div>
        </div>
        <div className="h-1 w-44 overflow-hidden rounded-full bg-secondary">
          <span
            className="block h-full w-1/3 rounded-full bg-primary"
            style={{
              backgroundImage:
                "linear-gradient(90deg, color-mix(in srgb, var(--primary) 55%, transparent), var(--primary))",
              animation: "nc-app-load 1.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
            }}
          />
        </div>
        <p className="text-sm text-muted-foreground">{tr("正在加载项目…", "Loading project…")}</p>
        <style>{`@keyframes nc-app-load { 0% { transform: translateX(-110%); } 100% { transform: translateX(330%); } }`}</style>
      </div>
    );
  }

  if (showLanguageSelector) {
    return (
      <LanguageSelector
        onSelect={async (lang) => {
          await postApi("/project/language", { language: lang });
          setShowLanguageSelector(false);
          refetchProject();
        }}
      />
    );
  }

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden font-sans">
      {/* Left Sidebar */}
      <Sidebar
        nav={nav}
        activePage={activePage}
        sse={sse}
        t={t}
        routePage={route.page}
        workbenchArea={route.page === "workbench" ? route.area ?? DEFAULT_WORKBENCH_AREA : undefined}
        workbenchBookId={route.page === "workbench" ? route.bookId : undefined}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <button
          type="button"
          aria-label={tr("关闭导航", "Close navigation")}
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Center Content */}
        <div className="flex min-w-0 flex-1 flex-col bg-background">
        {route.page !== "workbench" && (
          <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-background px-6 max-lg:px-4">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={tr("打开导航", "Open navigation")}
            title={tr("打开导航", "Open navigation")}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={nav.toDashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-(--nc-inset) transition-colors hover:bg-secondary"
            >
              <House size={17} aria-hidden="true" />
              <span>{t("bread.home")}</span>
              <span className="text-muted-foreground/70" aria-hidden="true">
                /
              </span>
              <span className="font-serif text-[17px]">Novel Creation</span>
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div
              role="group"
              aria-label="界面语言"
              className="flex gap-0.5 rounded-full border border-hairline bg-secondary/70 p-0.5"
            >
              <button
                type="button"
                aria-pressed={currentLang === "zh"}
                onClick={() => void changeLanguage("zh")}
                className={`rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${
                  currentLang === "zh"
                    ? "bg-card text-foreground shadow-(--nc-shadow-1)"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                中
              </button>
              <button
                type="button"
                aria-pressed={currentLang === "en"}
                onClick={() => void changeLanguage("en")}
                className={`rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${
                  currentLang === "en"
                    ? "bg-card text-foreground shadow-(--nc-shadow-1)"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              aria-label={isDark ? tr("切换到浅色主题", "Switch to light theme") : tr("切换到深色主题", "Switch to dark theme")}
              title={isDark ? tr("切换到浅色主题", "Switch to light theme") : tr("切换到深色主题", "Switch to dark theme")}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          </div>
          </header>
        )}

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-y-auto scroll-smooth">
          {route.page === "dashboard" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <Dashboard nav={nav} sse={sse} theme={theme} t={t} />
            </div>
          )}
          {route.page === "workbench" && (
            <div className="absolute inset-0 flex min-w-0">
              <WorkbenchApp
                area={route.area ?? DEFAULT_WORKBENCH_AREA}
                onAreaChange={goWorkbenchArea}
                bookId={route.bookId}
                theme={theme}
                onToggleTheme={() => setTheme(isDark ? "light" : "dark")}
                onOpenModelConfig={nav.toServices}
                language={currentLang}
                onLanguageChange={changeLanguage}
                onToggleSidebar={() => setSidebarOpen(true)}
                onCreateBook={nav.toBookCreate}
                onImportBook={() => nav.toImport()}
                onOpenAnalytics={(bookId) => { if (bookId) nav.toAnalytics(bookId); }}
                onOpenResearch={nav.toRadar}
                events={sse.messages}
              />
            </div>
          )}
          {isBookCreateChatRoute(route) && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                mode="book-create"
                genre={route.genre}
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "chat" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                mode="project-chat"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "book" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                activeBookId={route.bookId}
                mode="book"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
              <BookSidebar bookId={route.bookId} theme={theme} t={t} sse={sse} />
              <BookSidebarToggle bookId={route.bookId} theme={theme} t={t} sse={sse} />
            </div>
          )}
          {route.page === "book-settings" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <BookDetail bookId={route.bookId} nav={nav} theme={theme} t={t} sse={sse} />
            </div>
          )}
          {route.page === "chapter" && (
            <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:px-10 lg:py-16 2xl:px-12 fade-in">
              <ChapterReader bookId={route.bookId} chapterNumber={route.chapterNumber} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "analytics" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <Analytics bookId={route.bookId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "services" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ServiceListPage nav={nav} />
            </div>
          )}
          {route.page === "project-settings" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ProjectSettings nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "service-detail" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ServiceDetailPage serviceId={route.serviceId} nav={nav} />
            </div>
          )}
          {route.page === "truth" && (
            <div className="absolute inset-0 flex min-w-0 overflow-hidden">
              <TruthFiles bookId={route.bookId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "daemon" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <DaemonControl nav={nav} theme={theme} t={t} sse={sse} />
            </div>
          )}
          {route.page === "logs" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <LogViewer nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "genres" && (
            <div className="absolute inset-0 flex min-w-0 overflow-hidden">
              <GenreManager nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "style" && (
            <div className="absolute inset-0 flex min-w-0 overflow-hidden">
              <StyleManager nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "translation" && (
            <div className="max-w-6xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <TranslationManager nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "import" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <ImportManager nav={nav} theme={theme} t={t} initialTab={route.tab} />
            </div>
          )}
          {route.page === "radar" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <RadarView nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "doctor" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <DoctorView nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "play" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <StoryPlayer projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "film" && (
            <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 lg:py-16 fade-in">
              <StoryGraphTree projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </div>
          )}
          {route.page === "film-author" && (
            <div className="absolute inset-0 flex min-w-0">
              <ChatPage
                activeBookId={route.projectId}
                mode="interactive-film-authoring"
                nav={nav}
                theme={theme}
                t={t}
                sse={sse}
              />
            </div>
          )}
          {route.page === "film-studio" && (
            <Suspense fallback={<div className="p-6 text-sm">{tr("加载创作向导…", "Loading creation wizard…")}</div>}>
              <FilmWizard projectId={route.projectId} nav={nav} theme={theme} t={t} sse={sse} />
            </Suspense>
          )}
          {route.page === "flow" && (
            <Suspense fallback={<div className="p-6 text-sm">{tr("加载流程图…", "Loading flow view…")}</div>}>
              <FlowView projectId={route.projectId} nav={nav} theme={theme} t={t} />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}

