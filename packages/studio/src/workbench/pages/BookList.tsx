/**
 * 作品列表 — the author's shelf.
 *
 * Sorted by last edit, searchable and filterable, with progress, governance
 * mode and pending work visible. Status is always text + icon, never colour
 * alone. The empty state offers the two real next actions instead of a product
 * pitch.
 */

import { useMemo, useState } from "react";
import { BookOpen, FileInput, Plus, Search, TriangleAlert } from "lucide-react";
import type { Book, BookGovernance, BookStatus, LoadState } from "../types";
import { Alert, Badge, Btn, Empty, Skeleton, type Tone } from "../ui";
import { formatNumber, formatRelative, formatWords } from "../format";

const STATUS_META: Record<BookStatus, { label: string; tone: Tone }> = {
  draft: { label: "草稿", tone: "neutral" },
  writing: { label: "写作中", tone: "brand" },
  review: { label: "审核中", tone: "warn" },
  complete: { label: "已完成", tone: "ok" },
};

const REVIEW_MODE_LABEL: Record<"auto" | "manual", string> = {
  auto: "自动续写",
  manual: "逐章确认",
};

const REVISION_GATE_LABEL: Record<"strict" | "lenient" | "always", string> = {
  strict: "严格修订",
  lenient: "宽松修订",
  always: "始终修订",
};

/** Renders the book's real governance; a null knob means it inherits the project. */
function governanceLabel(governance: BookGovernance): string {
  const review = governance.reviewMode
    ? REVIEW_MODE_LABEL[governance.reviewMode]
    : "审核跟随项目";
  const revision = governance.revisionGate
    ? REVISION_GATE_LABEL[governance.revisionGate]
    : "修订跟随项目";
  return `${review} · ${revision}`;
}

export interface BookListProps {
  readonly books: readonly Book[];
  readonly loadState: LoadState;
  readonly loadError: string | null;
  readonly onRetry: () => void;
  readonly onOpen: (bookId: string) => void;
  readonly onOpenOutline: (bookId: string) => void;
  readonly onOpenReview: (bookId: string) => void;
  readonly onNew: () => void;
  readonly onImport: () => void;
}

export function BookList({
  books,
  loadState,
  loadError,
  onRetry,
  onOpen,
  onOpenOutline,
  onOpenReview,
  onNew,
  onImport,
}: BookListProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BookStatus | "all">("all");
  const [sort, setSort] = useState<"recent" | "title" | "progress">("recent");

  const visible = useMemo(() => {
    const filtered = books.filter((book) => {
      if (status !== "all" && book.status !== status) return false;
      if (query.trim() && !book.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "recent") sorted.sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt));
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    if (sort === "progress") {
      sorted.sort((a, b) => (b.chaptersCommitted / Math.max(1, b.chaptersPlanned)) - (a.chaptersCommitted / Math.max(1, a.chaptersPlanned)));
    }
    return sorted;
  }, [books, query, status, sort]);

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">作品列表</h1>
          <p className="nc-page-desc">按最近编辑排序，显示正式章节、字数、治理模式与待处理任务。迁移未完成的作品不会假装已有提交历史。</p>
        </div>
        <div className="nc-btn-group">
          <Btn variant="ghost" icon={<FileInput size={14} aria-hidden="true" />} onClick={onImport}>导入</Btn>
          <Btn variant="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={onNew}>新建作品</Btn>
        </div>
      </header>

      <div className="nc-band">
        <label className="nc-visually-hidden" htmlFor="nc-book-search">搜索作品</label>
        <span className="nc-row" style={{ padding: 0, gap: 6 }}>
          <Search size={14} aria-hidden="true" />
          <input
            id="nc-book-search"
            className="nc-input"
            type="search"
            style={{ width: 220 }}
            value={query}
            placeholder="搜索作品标题"
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>

        <div className="nc-seg" role="group" aria-label="按状态筛选">
          {(["all", "draft", "writing", "review", "complete"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>
              {value === "all" ? "全部" : STATUS_META[value].label}
            </button>
          ))}
        </div>

        <span className="nc-spacer" />

        <label className="nc-meta" htmlFor="nc-book-sort">排序</label>
        <select
          id="nc-book-sort"
          className="nc-select"
          style={{ width: "auto" }}
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
        >
          <option value="recent">最近编辑</option>
          <option value="title">标题</option>
          <option value="progress">完成度</option>
        </select>
      </div>

      <div className="nc-page-body">
        {loadState === "loading" && <Skeleton rows={5} label="正在载入作品列表" />}

        {loadState === "error" && (
          <Alert tone="block" title="作品列表读取失败">
            <span>{loadError ?? "未知错误。"}</span>
            <span className="nc-btn-group" style={{ marginTop: 8 }}>
              <Btn onClick={onRetry}>重试</Btn>
            </span>
          </Alert>
        )}

        {loadState === "ready" && books.length === 0 && (
          <Empty
            icon={<BookOpen size={18} aria-hidden="true" />}
            title="还没有作品"
            detail="新建一本长篇开始写作，或从已有稿件导入章节与设定。"
            action={
              <>
                <Btn variant="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={onNew}>新建作品</Btn>
                <Btn icon={<FileInput size={14} aria-hidden="true" />} onClick={onImport}>导入稿件</Btn>
              </>
            }
          />
        )}

        {loadState === "ready" && books.length > 0 && visible.length === 0 && (
          <Empty
            icon={<Search size={18} aria-hidden="true" />}
            title="没有符合条件的作品"
            detail="调整搜索词或状态筛选，或清空筛选查看全部作品。"
            action={<Btn onClick={() => { setQuery(""); setStatus("all"); }}>清空筛选</Btn>}
          />
        )}

        {loadState === "ready" && visible.length > 0 && (
          <div className="nc-bookgrid">
            {visible.map((book) => {
              const meta = STATUS_META[book.status];
              const ratio = book.chaptersPlanned === 0 ? 0 : book.chaptersCommitted / book.chaptersPlanned;
              return (
                <article className="nc-card nc-book-row" key={book.id}>
                  <div className="nc-row" style={{ padding: "12px 14px", gap: 14, flex: 1, minWidth: 0 }}>
                    <span className="nc-book-tile" aria-hidden="true">{book.title.slice(0, 1)}</span>
                    <div className="nc-row-fill">
                      <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="nc-selectable nc-h2"
                          onClick={() => onOpen(book.id)}
                          title={`打开《${book.title}》`}
                        >
                          {book.title}
                        </button>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <Badge tone="neutral">{governanceLabel(book.governance)}</Badge>
                        {book.migration === "pending" && (
                          <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden="true" />}>
                            迁移未完成
                          </Badge>
                        )}
                        {book.pendingTaskCount !== null && book.pendingTaskCount > 0 && (
                          <Badge tone="info">{book.pendingTaskCount} 个待处理任务</Badge>
                        )}
                      </div>

                      <span className="nc-meta">{book.genre} · 最近编辑 {formatRelative(book.lastEditedAt)}</span>

                      <div className="nc-book-stats" style={{ marginTop: 4 }}>
                        <span className="nc-book-stat">
                          <span className="nc-label">正式章节</span>
                          <span className="nc-num">{book.chaptersCommitted} / {book.chaptersPlanned}</span>
                        </span>
                        <span className="nc-book-stat">
                          <span className="nc-label">字数</span>
                          {/* Unknown is shown as unknown. An estimate presented
                              as a count is worse than admitting the gap. */}
                          <span className="nc-num">
                            {book.wordCount === null ? "未知" : formatNumber(book.wordCount)}
                          </span>
                        </span>
                        <span className="nc-book-stat" style={{ minWidth: 120 }}>
                          <span className="nc-label">完成度</span>
                          <span style={{ display: "block", marginTop: 3 }}>
                            <span className="nc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={`${book.title} 完成度`}>
                              <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </span>
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="nc-book-actions" style={{ padding: "12px 14px" }}>
                    <Btn
                      variant="primary"
                      onClick={() => onOpen(book.id)}
                      disabled={book.migration === "pending"}
                      title={book.migration === "pending" ? "迁移完成后才能进入写作工作区" : "进入写作工作区"}
                    >
                      继续写作
                    </Btn>
                    <Btn onClick={() => onOpenOutline(book.id)}>细纲与合同</Btn>
                    <Btn onClick={() => onOpenReview(book.id)}>审核</Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {loadState === "ready" && books.length > 0 && (
          <p className="nc-meta" style={{ marginTop: 14 }}>
                    共 {visible.length} 部作品，合计 {formatWords(visible.reduce((sum, book) => sum + (book.wordCount ?? 0), 0))}。
          </p>
        )}
      </div>
    </>
  );
}

