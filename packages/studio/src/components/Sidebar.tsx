import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi, fetchJson } from "../hooks/use-api";
import { useNewSSEMessages, type SSEMessage } from "../hooks/use-sse";
import { applyBookCollectionEvent, shouldRefetchBookCollections, shouldRefetchDaemonStatus } from "../hooks/use-book-activity";
import type { TFunction } from "../hooks/use-i18n";
import { WORKBENCH_AREAS } from "../workbench/areas";
import type { WorkbenchArea } from "../workbench/types";
import { tr } from "../lib/app-language";
import { useShallow } from "zustand/react/shallow";
import { setProjectChatSessionId } from "../pages/chat-page-state";
import { useChatStore } from "../store/chat";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Settings,
  Plus,
  MessageSquare,
  Gamepad2,
  ScrollText,
  BookPlus,
  BookCopy,
  Boxes,
  Feather,
  Wand2,
  FileInput,
  TrendingUp,
  Stethoscope,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Home,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  GitBranch,
  Clapperboard,
  Rows3,
  Film,
  Download,
  Activity,
  BookOpen,
  FlaskConical,
  ListTree,
  PenLine,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { NovelCreationLogo } from "./NovelCreationLogo";

// 历史记录里的会话混装多种类型（chat / short / play / book-create），用图标区分。
function SessionKindIcon({ kind, className }: { readonly kind?: string; readonly className?: string }) {
  const Icon =
    kind === "play" ? Gamepad2
    : kind === "short" ? ScrollText
    : kind === "script" ? Clapperboard
    : kind === "storyboard" ? Rows3
    : kind === "interactive-film" ? Film
    : kind === "book-create" ? BookPlus
    : MessageSquare;
  return <Icon size={13} className={className} />;
}

interface BookSummary {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly status: string;
  readonly chaptersWritten: number;
}

interface ShelfBook {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly status: string;
}

// Stable empty reference so the zustand selector never allocates a new array.

// Novel Creation workbench navigation lives under each work in "My Works", so
// the labels are declared inline where they are rendered.

interface Nav {
  toDashboard: () => void;
  toChat: () => void;
  toWorkbench: (area?: WorkbenchArea, bookId?: string) => void;
  toBook: (id: string) => void;
  toBookSettings: (id: string) => void;
  toBookCreate: () => void;
  toServices: () => void;
  toProjectSettings: () => void;
  toDaemon: () => void;
  toLogs: () => void;
  toGenres: () => void;
  toStyle: () => void;
  toTranslation: () => void;
  toImport: (tab?: "chapters" | "canon" | "fanfic" | "spinoff" | "imitation") => void;
  toRadar: () => void;
  toDoctor: () => void;
  toFilmStudio: (id: string) => void;
}

const ROW_PAD: Record<0 | 1 | 2, string> = {
  0: "px-2.5 text-[13.5px]",
  1: "pl-9 pr-2 text-[12.5px]",
  2: "pl-14 pr-2 text-[12px]",
};

/** A clickable row. Deeper levels indent and drop their own icon. */
function NavRow({ label, icon, active, depth = 0, onClick }: {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly active: boolean;
  readonly depth?: 0 | 1 | 2;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group/nav relative flex w-full items-center gap-2.5 rounded-lg py-2 text-left leading-5 transition-colors ${ROW_PAD[depth]} ${
        active
          ? "bg-secondary text-foreground font-semibold"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" aria-hidden="true" />
      )}
      {icon && depth === 0 && (
        <span className={`shrink-0 ${active ? "text-primary" : "text-muted-foreground/70 group-hover/nav:text-foreground"}`}>
          {icon}
        </span>
      )}
      <span className="truncate flex-1">{label}</span>
    </button>
  );
}

/** A collapsible entry: the header navigates, the caret expands children. */
function NavGroup({ label, icon, active, open, depth = 0, onNavigate, onToggle, children }: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly active: boolean;
  readonly open: boolean;
  readonly depth?: 0 | 1;
  readonly onNavigate: () => void;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <div className="group/nav relative flex items-center rounded-lg">
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 text-left leading-5 transition-colors ${
            depth === 1 ? "pl-7 pr-1 text-[12.5px]" : "px-2.5 text-[13.5px]"
          } ${active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          <span className={`shrink-0 ${depth === 1 ? "[&>svg]:h-3.5 [&>svg]:w-3.5" : ""} ${active ? "text-primary" : "text-muted-foreground/70 group-hover/nav:text-foreground"}`}>
            {icon}
          </span>
          <span className="truncate flex-1">{label}</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? tr(`收起${label}`, `Collapse ${label}`) : tr(`展开${label}`, `Expand ${label}`)}
          aria-expanded={open}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronRight size={13} className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </button>
      </div>
      <Collapse open={open}>
        <div className={`space-y-0.5 pb-0.5 ${depth === 1 ? "pl-2" : ""}`}>{children}</div>
      </Collapse>
    </div>
  );
}

export function Sidebar({ nav, activePage, routePage, sse, t, workbenchArea, workbenchBookId, mobileOpen = false, onMobileClose }: {
  nav: Nav;
  activePage: string;
  routePage: string;
  sse: { messages: ReadonlyArray<SSEMessage> };
  t: TFunction;
  workbenchArea?: WorkbenchArea;
  workbenchBookId?: string;
  /** On small screens the shell turns into an explicit drawer. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const { data, refetch: refetchBooks, mutate: mutateBooks } = useApi<{ books: ReadonlyArray<BookSummary> }>("/books");
  const { data: filmsData, refetch: refetchFilms } = useApi<{ films: ReadonlyArray<{ projectId: string; title: string }> }>("/interactive-films");
  const { data: daemon, refetch: refetchDaemon } = useApi<{ running: boolean }>("/daemon");
  // Subscribe to a flat projection of the fields this sidebar renders, and
  // compare it shallowly. Selecting the whole `sessions` map re-rendered the
  // sidebar on every 48ms streaming flush even though nothing visible changed.
  const sessionFlat = useChatStore(useShallow((s) => {
    const flat: Array<string | boolean> = [];
    for (const id of Object.keys(s.sessions).sort()) {
      const runtime = s.sessions[id]!;
      // Only cheap fields here: this selector runs on every store update, so it
      // must not scan each session's message history.
      flat.push(
        id,
        runtime.title ?? "",
        runtime.messages.length > 0,
        Boolean(runtime.isDraft),
        Boolean(runtime.isStreaming),
        runtime.sessionKind ?? "",
        runtime.bookId ?? "",
      );
    }
    return flat;
  }));
  const sessionViews = useMemo(() => {
    const map: Record<string, {
      readonly sessionId: string;
      readonly title: string | null;
      readonly hasMessages: boolean;
      readonly isDraft: boolean;
      readonly isStreaming: boolean;
      readonly sessionKind?: string;
      readonly bookId: string | null;
    }> = {};
    for (let i = 0; i + 6 < sessionFlat.length; i += 7) {
      const sessionId = sessionFlat[i] as string;
      map[sessionId] = {
        sessionId,
        title: (sessionFlat[i + 1] as string) || null,
        hasMessages: sessionFlat[i + 2] as boolean,
        isDraft: sessionFlat[i + 3] as boolean,
        isStreaming: sessionFlat[i + 4] as boolean,
        sessionKind: (sessionFlat[i + 5] as string) || undefined,
        bookId: (sessionFlat[i + 6] as string) || null,
      };
    }
    return map;
  }, [sessionFlat]);
  const sessionIdsByBook = useChatStore((s) => s.sessionIdsByBook);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const bookDataVersion = useChatStore((s) => s.bookDataVersion);
  const loadSessionList = useChatStore((s) => s.loadSessionList);
  const loadSessionDetail = useChatStore((s) => s.loadSessionDetail);
  const activateSession = useChatStore((s) => s.activateSession);
  const createDraftSession = useChatStore((s) => s.createDraftSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const setInput = useChatStore((s) => s.setInput);
  const [renameTarget, setRenameTarget] = useState<{ sessionId: string; currentTitle: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; title: string } | null>(null);
  const [bookDeleteTarget, setBookDeleteTarget] = useState<{ bookId: string; title: string } | null>(null);
  const [bookActionError, setBookActionError] = useState<string | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [projectChatExpanded, setProjectChatExpanded] = useState(true);
  const [myWorksOpen, setMyWorksOpen] = useState(true);
  const [researchOpen, setResearchOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Only one business group is expanded at a time (每次最多展开一个业务分组).
  const [openWorkGroup, setOpenWorkGroup] = useState<string | null>("writing");
  const [currentBookId, setCurrentBookId] = useState<string | undefined>(undefined);

  const books = data?.books ?? [];
  const films = filmsData?.films ?? [];
  const realBookIds = useMemo(() => new Set(books.map((book) => book.id)), [books]);

  // Only real books on disk appear on the shelf. The workbench's demo dataset is
  // never listed here: a demo entry has no book.json, so it cannot be opened,
  // configured or deleted, and offering those actions would silently fail.
  const shelfBooks = useMemo<ShelfBook[]>(
    () => books.map((book) => ({ id: book.id, title: book.title, genre: book.genre, status: book.status })),
    [books],
  );

  const projectChatKey = "__null__";
  const projectChatSessions = useMemo(
    () =>
      (sessionIdsByBook[projectChatKey] ?? [])
        .map((sessionId) => sessionViews[sessionId])
        .filter((session): session is NonNullable<(typeof sessionViews)[string]> => {
          if (!session) return false;
          return Boolean(session.title)
            || session.hasMessages
            || session.isDraft
            || session.sessionId === activeSessionId;
        }),
    [activeSessionId, sessionIdsByBook, sessionViews],
  );

  const sessionsByBook = useMemo(
    () =>
      Object.fromEntries(
        shelfBooks.map((book) => [
          book.id,
          (sessionIdsByBook[book.id] ?? [])
            .map((sessionId) => sessionViews[sessionId])
            .filter(Boolean),
        ]),
      ) as Record<string, Array<(typeof sessionViews)[string]>>,
    [shelfBooks, sessionIdsByBook, sessionViews],
  );

  // Resolve the "current book" from the route, then the workbench, then fall
  // back to the first shelf entry.
  useEffect(() => {
    if (workbenchBookId) {
      setCurrentBookId(workbenchBookId);
      return;
    }
    if (activePage.startsWith("book:")) {
      setCurrentBookId(activePage.slice("book:".length));
    }
  }, [workbenchBookId, activePage]);

  useEffect(() => {
    if (!currentBookId && shelfBooks.length > 0) setCurrentBookId(shelfBooks[0].id);
  }, [shelfBooks, currentBookId]);

  // Process every new SSE message, not just the latest one. A burst of events
  // (e.g. `book:created` immediately followed by progress/log events) used to
  // lose the shelf update because only `messages.at(-1)` was inspected, so a
  // freshly created book only appeared after a manual refresh.
  useNewSSEMessages(sse.messages, (message) => {
    if (shouldRefetchBookCollections(message)) {
      let appliedIncrementally = false;
      mutateBooks((current) => {
        const updatedBooks = applyBookCollectionEvent(current?.books ?? [], message);
        if (!updatedBooks) return current;
        appliedIncrementally = true;
        return { books: updatedBooks };
      });
      if (!appliedIncrementally) {
        refetchBooks();
      }
    }
    if (shouldRefetchDaemonStatus(message)) {
      refetchDaemon();
    }
  });

  // bookDataVersion 变化（外部数据信号）时才重拉当前已展开书的 session 列表；
  // 展开/折叠本身不触发请求（展开由 toggleBook 驱动，已带"首次加载"判断）。
  useEffect(() => {
    for (const bookId of expandedBooks) {
      if (realBookIds.has(bookId)) void loadSessionList(bookId);
    }
    if (projectChatExpanded) {
      void loadSessionList(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookDataVersion, loadSessionList, projectChatExpanded]);

  useEffect(() => {
    void refetchFilms();
  }, [bookDataVersion, refetchFilms]);

  useEffect(() => {
    if (activePage === "chat") {
      setProjectChatExpanded(true);
      void loadSessionList(null);
    }
  }, [activePage, loadSessionList]);

  const toggleBook = (bookId: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
        return next;
      }
      next.add(bookId);
      // 首次展开才拉：已有 sessionIdsByBook 数据就直接用缓存
      if (realBookIds.has(bookId) && sessionIdsByBook[bookId] === undefined) {
        void loadSessionList(bookId);
      }
      return next;
    });
  };

  const openBook = (bookId: string) => {
    setCurrentBookId(bookId);
    // 从工作台内切换作品时留在工作台，沿用当前业务页；其它页面保持进入该书。
    if (activePage === "workbench") {
      nav.toWorkbench(workbenchArea, bookId);
      return;
    }
    if (!realBookIds.has(bookId)) {
      // Demo/workbench-only book: stay in the workbench surface.
      nav.toWorkbench("books", bookId);
      return;
    }
    setInput("");
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      next.add(bookId);
      return next;
    });
    if (sessionIdsByBook[bookId] === undefined) {
      void loadSessionList(bookId);
    }
    nav.toBook(bookId);
  };

  const openSession = (bookId: string, sessionId: string) => {
    setInput("");
    activateSession(sessionId);
    nav.toBook(bookId);
    void loadSessionDetail(sessionId);
  };

  const handleCreateSession = (bookId: string) => {
    // 前端创建草稿会话：对话区立即变空，但 session 文件不落盘；
    // 发第一条消息时 sendMessage 会调 POST /sessions 真正创建。
    setExpandedBooks((prev) => new Set(prev).add(bookId));
    setInput("");
    createDraftSession(bookId, "book");
    nav.toBook(bookId);
  };

  const openProjectChatSession = (sessionId: string) => {
    setInput("");
    activateSession(sessionId);
    setProjectChatSessionId(sessionId);
    nav.toChat();
    void loadSessionDetail(sessionId);
  };

  const handleCreateProjectChatSession = () => {
    setProjectChatExpanded(true);
    const sessionId = createDraftSession(null, "chat");
    setProjectChatSessionId(sessionId);
    setInput("");
    nav.toChat();
  };

  const handleOpenBookCreate = () => {
    setInput("");
    nav.toBookCreate();
  };

  const launchProjectMode = (kind: "short" | "play" | "script" | "storyboard" | "interactive-film", playMode?: "guided" | "open") => {
    setProjectChatExpanded(true);
    // Play mode (分支互动 = guided / 自由互动 = open) is now decided here at the
    // launcher, not via an in-chat button.
    const sessionId = createDraftSession(null, kind, playMode);
    setProjectChatSessionId(sessionId);
    setInput("");
    nav.toChat();
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget) return;
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    await renameSession(renameTarget.sessionId, nextTitle);
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteSession(deleteTarget.sessionId);
    setDeleteTarget(null);
  };

  const handleBookDeleteConfirm = async () => {
    if (!bookDeleteTarget) return;
    const { bookId, title } = bookDeleteTarget;
    setBookDeleteTarget(null);
    setBookActionError(null);
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
    } catch (error) {
      // Surface the failure instead of silently leaving the book in place.
      setBookActionError(
        tr(
          `删除《${title}》失败：${error instanceof Error ? error.message : String(error)}`,
          `Failed to delete "${title}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }
    if (currentBookId === bookId) setCurrentBookId(undefined);
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      next.delete(bookId);
      return next;
    });
    refetchBooks();
  };

  const resolvedBookId = currentBookId ?? workbenchBookId;
  const currentBook = shelfBooks.find((book) => book.id === resolvedBookId) ?? shelfBooks[0];
  const goWorkbench = (area: WorkbenchArea) => nav.toWorkbench(area, currentBook?.id);
  const isWb = (area: WorkbenchArea) => activePage === "workbench" && workbenchArea === area;
  // A workbench area is "active for this book" only when the route names the book.
  const isBookArea = (book: ShelfBook, area: WorkbenchArea) =>
    activePage === "workbench" && workbenchBookId === book.id && workbenchArea === area;

  return (
    <aside
      className={`relative flex h-full w-[240px] shrink-0 flex-col overflow-hidden border-r border-hairline bg-background select-none max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:h-dvh max-lg:shadow-(--nc-shadow-3) max-lg:transition-transform max-lg:duration-200 ${
        mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
      }`}
      aria-label={tr("主导航", "Primary navigation")}
    >
      {/* ── Brand + primary create action (fixed) ─────────────────────── */}
      <div className="px-4 pt-6 pb-3 space-y-3">
        <button
          onClick={nav.toDashboard}
          className="group flex items-center gap-3 hover:opacity-80 transition-all duration-300"
        >
          <NovelCreationLogo className="w-10 h-10 shrink-0 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="font-serif text-[21px] leading-none italic font-medium">Novel</span>
            <span className="text-[12px] uppercase text-muted-foreground font-bold mt-1.5">Creation</span>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-3 py-2.5 text-[13.5px] font-semibold shadow-sm hover:opacity-90 transition-opacity">
            <Plus size={16} />
            <span>{tr("新建", "New")}</span>
            <ChevronDown size={14} className="opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("创建作品", "Create work")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleOpenBookCreate}>
                <BookPlus size={14} /><span>{t("nav.createNovel")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("short")}>
                <ScrollText size={14} /><span>{t("nav.createShort")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("script")}>
                <Clapperboard size={14} /><span>{t("nav.createScript")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("storyboard")}>
                <Rows3 size={14} /><span>{t("nav.createStoryboard")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("interactive-film")}>
                <Film size={14} /><span>{t("nav.createInteractiveFilm")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("基于已有作品", "From existing work")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleCreateProjectChatSession}>
                <Feather size={14} /><span>{t("nav.createFanfic")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateProjectChatSession}>
                <BookCopy size={14} /><span>{t("nav.createSpinoff")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateProjectChatSession}>
                <Wand2 size={14} /><span>{t("nav.createImitation")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateProjectChatSession}>
                <FileInput size={14} /><span>{t("nav.createContinuation")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("play", "guided")}>
                <GitBranch size={14} /><span>{t("nav.createBranching")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => launchProjectMode("play", "open")}>
                <Gamepad2 size={14} /><span>{t("nav.createFree")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("导入", "Import")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => nav.toImport()}>
                <FileInput size={14} /><span>{tr("导入现有作品", "Import work")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav.toImport("chapters")}>
                <FileInput size={14} /><span>{tr("导入章节", "Import chapters")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="absolute right-3 top-6 hidden size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground max-lg:flex"
          onClick={onMobileClose}
          aria-label={tr("关闭导航", "Close navigation")}
          title={tr("关闭导航", "Close navigation")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      {/* ── Scrollable navigation (工作台 + 当前作品) ──────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4" data-testid="novel-creation-section">
        <GroupLabel label={tr("工作台", "Workspace")} />
        <div className="space-y-0.5">
          <NavRow
            label={tr("首页", "Home")}
            icon={<Home size={16} />}
            active={activePage === "dashboard"}
            onClick={nav.toDashboard}
          />

          <NavGroup
            label={tr("我的作品", "My Works")}
            icon={<BookOpen size={16} />}
            active={isWb("books")}
            open={myWorksOpen}
            onNavigate={() => nav.toWorkbench("books")}
            onToggle={() => setMyWorksOpen((v) => !v)}
          >
            {shelfBooks.map((book) => {
              const bookSessions = sessionsByBook[book.id] ?? [];
              const isActiveBook = activePage === `book:${book.id}`
                || (activePage === "workbench" && workbenchBookId === book.id);
              const isExpanded = expandedBooks.has(book.id);
              return (
                <div key={book.id}>
                  <div className="group/book flex items-center">
                    <button
                      type="button"
                      aria-label={isExpanded ? tr(`折叠 ${book.title}`, `Collapse ${book.title}`) : tr(`展开 ${book.title}`, `Expand ${book.title}`)}
                      onClick={() => toggleBook(book.id)}
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      <ChevronRight size={11} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openBook(book.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12.5px] leading-5 transition-colors ${
                        isActiveBook ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                      }`}
                    >
                      <FolderOpen size={13} className="shrink-0 text-muted-foreground/60" />
                      <span className="truncate flex-1">{book.title}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={tr(`《${book.title}》更多操作`, `More actions for ${book.title}`)}
                        title={tr("更多操作（作品设置 / 删除作品）", "More actions (settings / delete)")}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/45 hover:bg-secondary/60 hover:text-foreground data-open:bg-secondary/60 data-open:text-foreground transition-colors"
                      >
                        <MoreHorizontal size={13} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="w-40">
                        <DropdownMenuItem onClick={() => nav.toBookSettings(book.id)}>
                          <Settings size={14} /><span>{tr("作品设置", "Work settings")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setBookDeleteTarget({ bookId: book.id, title: book.title })}
                        >
                          <Trash2 size={14} /><span>{tr("删除作品", "Delete work")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Collapse open={isExpanded}>
                    <div className="space-y-0.5 pb-1">
                      {/* Per-book authoring nav — each work is its own directory. */}
                      <NavRow
                        depth={1}
                        label={tr("概览", "Overview")}
                        active={routePage === "book" && activePage === `book:${book.id}`}
                        onClick={() => {
                          if (realBookIds.has(book.id)) nav.toBook(book.id);
                          else nav.toWorkbench("books", book.id);
                        }}
                      />
                      <NavRow
                        depth={1}
                        label={tr("设定与大纲", "Setting & Outline")}
                        icon={<ListTree size={14} />}
                        active={isBookArea(book, "outline")}
                        onClick={() => nav.toWorkbench("outline", book.id)}
                      />
                      <NavGroup
                        depth={1}
                        label={tr("写作", "Writing")}
                        icon={<PenLine size={14} />}
                        active={isBookArea(book, "writing") || isBookArea(book, "compare") || isBookArea(book, "commit")}
                        open={openWorkGroup === `${book.id}:writing`}
                        onNavigate={() => { nav.toWorkbench("writing", book.id); setOpenWorkGroup(`${book.id}:writing`); }}
                        onToggle={() => setOpenWorkGroup((v) => (v === `${book.id}:writing` ? null : `${book.id}:writing`))}
                      >
                        <NavRow depth={2} label={tr("版本比较", "Versions")} active={isBookArea(book, "compare")} onClick={() => nav.toWorkbench("compare", book.id)} />
                        <NavRow depth={2} label={tr("提交确认", "Commit")} active={isBookArea(book, "commit")} onClick={() => nav.toWorkbench("commit", book.id)} />
                      </NavGroup>
                      <NavGroup
                        depth={1}
                        label={tr("审核", "Review")}
                        icon={<ShieldAlert size={14} />}
                        active={isBookArea(book, "review")}
                        open={openWorkGroup === `${book.id}:review`}
                        onNavigate={() => { nav.toWorkbench("review", book.id); setOpenWorkGroup(`${book.id}:review`); }}
                        onToggle={() => setOpenWorkGroup((v) => (v === `${book.id}:review` ? null : `${book.id}:review`))}
                      >
                        <NavRow depth={2} label={tr("文风检查", "Style")} active={routePage === "style" && isActiveBook} onClick={nav.toStyle} />
                      </NavGroup>
                      <NavRow depth={1} label={tr("连载分析", "Serial Analytics")} active={isBookArea(book, "analytics")} onClick={() => nav.toWorkbench("analytics", book.id)} />
                      <NavGroup
                        depth={1}
                        label={tr("导出发布", "Export & Publish")}
                        icon={<Download size={14} />}
                        active={isBookArea(book, "export")}
                        open={openWorkGroup === `${book.id}:export`}
                        onNavigate={() => { nav.toWorkbench("export", book.id); setOpenWorkGroup(`${book.id}:export`); }}
                        onToggle={() => setOpenWorkGroup((v) => (v === `${book.id}:export` ? null : `${book.id}:export`))}
                      >
                        <NavRow depth={2} label={tr("翻译译介", "Translation")} active={activePage === "translation"} onClick={nav.toTranslation} />
                      </NavGroup>

                      {bookSessions.map((session) => {
                        const isActiveSession = isActiveBook && activeSessionId === session.sessionId;
                        const label = getSessionLabel(session);
                        return (
                          <div
                            key={session.sessionId}
                            className={`group/session flex items-center rounded-lg ${isActiveSession ? "bg-secondary/50" : "hover:bg-secondary/30"}`}
                          >
                            <button
                              type="button"
                              onClick={() => openSession(book.id, session.sessionId)}
                              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-11 pr-2 text-left text-[12px] leading-5 transition-colors"
                            >
                              <span className={`truncate flex-1 ${isActiveSession ? "text-foreground" : "text-muted-foreground"}`}>
                                {label}
                              </span>
                              {session.isStreaming ? (
                                <Loader2 size={11} className="shrink-0 animate-spin text-primary" />
                              ) : (
                                <span className="shrink-0 text-[10px] text-muted-foreground/40">
                                  {formatRelativeTime(session.sessionId)}
                                </span>
                              )}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover/session:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                                <MoreHorizontal size={13} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start" className="w-36">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRenameTarget({ sessionId: session.sessionId, currentTitle: label });
                                    setRenameValue(session.title ?? "");
                                  }}
                                >
                                  <Pencil size={14} /><span>{tr("改名", "Rename")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget({ sessionId: session.sessionId, title: label })}
                                >
                                  <Trash2 size={14} /><span>{tr("删除", "Delete")}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
                      {realBookIds.has(book.id) && (
                        <button
                          type="button"
                          onClick={() => void handleCreateSession(book.id)}
                          className="flex w-full items-center gap-2 py-1.5 pl-11 pr-2 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors"
                        >
                          <Plus size={11} />
                          <span>{tr("新建会话", "New session")}</span>
                        </button>
                      )}

                      {/* Explicit work actions so deletion is discoverable, not
                          hidden behind a hover-only icon. Only real books can be
                          configured or deleted; demo shelf entries cannot. */}
                      {realBookIds.has(book.id) && (
                        <div className="mt-1 border-t border-hairline pt-1">
                          <NavRow
                            depth={1}
                            label={tr("作品设置", "Work settings")}
                            active={routePage === "book-settings" && isActiveBook}
                            onClick={() => nav.toBookSettings(book.id)}
                          />
                          <button
                            type="button"
                            onClick={() => setBookDeleteTarget({ bookId: book.id, title: book.title })}
                            className="flex w-full items-center gap-2 rounded-lg py-2 pl-9 pr-2 text-left text-[12.5px] leading-5 text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 size={13} className="shrink-0" />
                            <span className="truncate flex-1">{tr("删除作品", "Delete work")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </Collapse>
                </div>
              );
            })}

            {/* Film projects keep their own data source; surfaced under My Works. */}
            <div data-testid="film-projects-section">
              {films.map((film) => (
                <button
                  key={film.projectId}
                  type="button"
                  data-testid={`film-project-${film.projectId}`}
                  onClick={() => nav.toFilmStudio(film.projectId)}
                  className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-9 pr-2 text-left text-[12.5px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Film size={13} className="shrink-0" />
                  <span className="truncate">{film.title}</span>
                </button>
              ))}
            </div>

            {shelfBooks.length === 0 && (
              <div className="px-3 py-3 text-center">
                <p className="text-[11px] leading-4 text-muted-foreground/60">
                  {tr("还没有作品。", "No works yet.")}
                </p>
                <button
                  type="button"
                  onClick={handleOpenBookCreate}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <Plus size={12} />
                  {tr("新建作品", "New work")}
                </button>
              </div>
            )}
          </NavGroup>

          <NavGroup
            label={tr("研究中心", "Research")}
            icon={<FlaskConical size={16} />}
            active={activePage === "radar" || activePage === "genres" || isWb("research")}
            open={researchOpen}
            onNavigate={() => { goWorkbench("research"); setResearchOpen(true); }}
            onToggle={() => setResearchOpen((v) => !v)}
          >
            <NavRow depth={1} label={tr("市场趋势", "Market Trends")} active={activePage === "radar"} onClick={nav.toRadar} />
            <NavRow depth={1} label={tr("题材库", "Genres")} active={activePage === "genres"} onClick={nav.toGenres} />
            <NavRow depth={1} label={tr("研究与分析", "Research & Analysis")} active={isWb("research")} onClick={() => goWorkbench("research")} />
          </NavGroup>

          <NavGroup
            label={tr("任务中心", "Tasks")}
            icon={<Activity size={16} />}
            active={isWb("tasks") || activePage === "daemon"}
            open={tasksOpen}
            onNavigate={() => { goWorkbench("tasks"); setTasksOpen(true); }}
            onToggle={() => setTasksOpen((v) => !v)}
          >
            <NavRow depth={1} label={tr("创作任务", "Authoring tasks")} active={isWb("tasks")} onClick={() => goWorkbench("tasks")} />
            <NavRow depth={1} label={tr("自动任务", "Automation")} active={activePage === "daemon"} onClick={nav.toDaemon} />
          </NavGroup>

          <NavGroup
            label={t("nav.history")}
            icon={<MessageSquare size={16} />}
            active={activePage === "chat"}
            open={historyOpen}
            onNavigate={() => {
              setHistoryOpen(true);
              nav.toChat();
              if (sessionIdsByBook[projectChatKey] === undefined) void loadSessionList(null);
            }}
            onToggle={() => setHistoryOpen((v) => !v)}
          >
            {projectChatSessions.slice(0, 3).map((session) => {
              const isActiveSession = activePage === "chat" && activeSessionId === session.sessionId;
              const label = getSessionLabel(session);
              return (
                <div
                  key={session.sessionId}
                  className={`group/session flex items-center rounded-lg ${isActiveSession ? "bg-secondary/50" : "hover:bg-secondary/30"}`}
                >
                  <button
                    type="button"
                    onClick={() => openProjectChatSession(session.sessionId)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-9 pr-2 text-left text-[12.5px] leading-5 transition-colors"
                  >
                    <SessionKindIcon
                      kind={session.sessionKind}
                      className={`shrink-0 ${isActiveSession ? "text-foreground" : "text-muted-foreground/60"}`}
                    />
                    <span className={`truncate flex-1 ${isActiveSession ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                    {session.isStreaming && <Loader2 size={11} className="shrink-0 animate-spin text-primary" />}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 group-hover/session:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                      <MoreHorizontal size={13} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-36">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget({ sessionId: session.sessionId, currentTitle: label });
                          setRenameValue(session.title ?? "");
                        }}
                      >
                        <Pencil size={14} /><span>{tr("改名", "Rename")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget({ sessionId: session.sessionId, title: label })}
                      >
                        <Trash2 size={14} /><span>{tr("删除", "Delete")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setProjectChatExpanded(true);
                nav.toChat();
                void loadSessionList(null);
              }}
              className="flex w-full items-center gap-2 py-1.5 pl-9 pr-2 text-[12.5px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {tr("查看全部会话…", "All sessions…")}
            </button>
          </NavGroup>
        </div>
      </div>

      {/* ── System entries (fixed footer) ─────────────────────────────── */}
      <div className="space-y-0.5 border-t border-hairline px-3 py-3">
        {bookActionError && (
          <div className="mb-1 flex items-start gap-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-4 text-destructive">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{bookActionError}</span>
            <button
              type="button"
              aria-label={tr("关闭提示", "Dismiss")}
              onClick={() => setBookActionError(null)}
              className="shrink-0 text-destructive/70 hover:text-destructive"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <GroupLabel label={tr("系统", "System")} />
        <NavRow
          label={tr("模型与服务", "Models & Services")}
          icon={<Settings size={16} />}
          active={activePage === "services"}
          onClick={nav.toServices}
        />
        <NavRow
          label={t("nav.projectSettings")}
          icon={<Boxes size={16} />}
          active={activePage === "project-settings"}
          onClick={nav.toProjectSettings}
        />
        <NavRow
          label={tr("诊断", "Diagnostics")}
          icon={<Stethoscope size={16} />}
          active={routePage === "doctor"}
          onClick={nav.toDoctor}
        />
        <NavRow depth={1} label={t("nav.logs")} active={routePage === "logs"} onClick={nav.toLogs} />
        {daemon?.running && (
          <div className="mt-1 flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {t("nav.agentOnline")}
          </div>
        )}
      </div>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[360px] p-4 gap-3"
        >
          <DialogHeader className="space-y-0 gap-0">
            <DialogTitle className="font-sans text-sm font-medium">{tr("重命名会话", "Rename Session")}</DialogTitle>
          </DialogHeader>
          <input
            id="session-rename-input"
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleRenameConfirm();
              }
            }}
            placeholder={tr("输入新标题", "Enter a new title")}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <DialogFooter className="gap-1 sm:gap-1">
            <button
              type="button"
              onClick={() => {
                setRenameTarget(null);
                setRenameValue("");
              }}
              className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tr("取消", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleRenameConfirm()}
              disabled={!renameValue.trim()}
              className="px-3 py-1 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              {tr("保存", "Save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={tr("删除会话", "Delete Session")}
        message={tr(
          `确认删除“${deleteTarget?.title ?? ""}”吗？该操作只删除这条会话，不影响书籍内容。`,
          `Delete "${deleteTarget?.title ?? ""}"? This only removes the session; the book content is not affected.`,
        )}
        confirmLabel={tr("删除", "Delete")}
        cancelLabel={tr("取消", "Cancel")}
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bookDeleteTarget !== null}
        title={tr("删除作品", "Delete work")}
        message={tr(
          `确认删除《${bookDeleteTarget?.title ?? ""}》吗？该操作会删除这本书的设定、大纲、正文与全部会话记录，且无法恢复。`,
          `Delete "${bookDeleteTarget?.title ?? ""}"? This removes the book's settings, outline, chapters and sessions, and cannot be undone.`,
        )}
        confirmLabel={tr("删除", "Delete")}
        cancelLabel={tr("取消", "Cancel")}
        variant="danger"
        onConfirm={() => void handleBookDeleteConfirm()}
        onCancel={() => setBookDeleteTarget(null)}
      />
    </aside>
  );
}

function getSessionLabel(session: { readonly sessionId: string; readonly title: string | null }): string {
  if (session.title) return session.title;
  // 后端会在第一条用户消息发送时立即把消息内容持久化为占位标题。
  // 这里是"已有消息但标题还没同步回来"的短暂中间态（乐观显示）。只在标题
  // 缺失时按需读取正文，避免在侧栏订阅里扫描每个会话的消息。
  const firstUserMessage = useChatStore.getState().sessions[session.sessionId]
    ?.messages.find((message) => message.role === "user")?.content?.trim();
  if (firstUserMessage) {
    const oneLine = firstUserMessage.replace(/\s+/g, " ");
    return oneLine.length > 20 ? `${oneLine.slice(0, 20)}…` : oneLine;
  }
  return tr("新会话", "New session");
}

function formatRelativeTime(sessionId: string): string {
  const rawTs = Number(sessionId.split("-")[0]);
  if (!Number.isFinite(rawTs)) return "";
  const diff = Date.now() - rawTs;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return tr("刚刚", "just now");
  if (minutes < 60) return tr(`${minutes} 分钟`, `${minutes}m`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr(`${hours} 小时`, `${hours}h`);
  const days = Math.floor(hours / 24);
  if (days < 30) return tr(`${days} 天`, `${days}d`);
  const months = Math.floor(days / 30);
  return tr(`${months} 个月`, `${months}mo`);
}

// Smooth collapse via grid-template-rows 0fr→1fr (content-height-agnostic, no JS measuring).
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function GroupLabel({ label }: { readonly label: string }) {
  return (
    <div className="px-2.5 pb-1 pt-5 text-[11px] uppercase text-muted-foreground/70 font-bold">
      {label}
    </div>
  );
}
