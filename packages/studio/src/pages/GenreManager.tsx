import { fetchJson, useApi, postApi } from "../hooks/use-api";
import { useState, useMemo } from "react";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useI18n } from "../hooks/use-i18n";
import { tr } from "../lib/app-language";
import { useColors } from "../hooks/use-colors";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Copy,
  SlidersHorizontal,
  X,
  Sparkles,
  BookMarked,
  ShieldAlert,
  Flame,
  FileText,
} from "lucide-react";

interface GenreInfo {
  readonly id: string;
  readonly name: string;
  readonly source: "project" | "builtin";
  readonly language: "zh" | "en";
}

interface GenreDetail {
  readonly profile: {
    readonly name: string;
    readonly id: string;
    readonly language: string;
    readonly chapterTypes: ReadonlyArray<string>;
    readonly fatigueWords: ReadonlyArray<string>;
    readonly numericalSystem: boolean;
    readonly powerScaling: boolean;
    readonly eraResearch: boolean;
    readonly pacingRule: string;
    readonly auditDimensions: ReadonlyArray<number>;
  };
  readonly body: string;
}

interface GenreFormData {
  readonly id: string;
  readonly name: string;
  readonly language: "zh" | "en";
  readonly chapterTypes: string;
  readonly fatigueWords: string;
  readonly numericalSystem: boolean;
  readonly powerScaling: boolean;
  readonly eraResearch: boolean;
  readonly pacingRule: string;
  readonly body: string;
}

const EMPTY_FORM: GenreFormData = {
  id: "",
  name: "",
  language: "zh",
  chapterTypes: "",
  fatigueWords: "",
  numericalSystem: false,
  powerScaling: false,
  eraResearch: false,
  pacingRule: "",
  body: "",
};

type GenreCategory = "all" | "fantasy" | "urban" | "romance" | "suspense" | "other";

const CATEGORY_MAP: Record<GenreCategory, { zh: string; en: string }> = {
  all: { zh: "全部", en: "All" },
  fantasy: { zh: "玄幻修仙", en: "Fantasy" },
  urban: { zh: "都市现代", en: "Urban" },
  romance: { zh: "言情脑洞", en: "Romance" },
  suspense: { zh: "悬疑惊悚", en: "Suspense" },
  other: { zh: "其他题材", en: "Other" },
};

function classifyGenre(g: GenreInfo): GenreCategory {
  const id = g.id.toLowerCase();
  const name = g.name.toLowerCase();
  const text = `${id} ${name}`;

  if (
    /修仙|仙侠|玄幻|高武|西幻|无限流|末世|科幻|异世|战神|绝世|重生成神|多子多福|xiuxian|xianxia|xuanhuan|cultivation|high-martial|western-fantasy|infinite|apocalypse|sci-fi|peerless|rebirth|isekai|litrpg|tower|dungeon|progression|system/.test(
      text,
    )
  ) {
    return "fantasy";
  }
  if (
    /都市|日常|脑洞|现实|电竞|直播|职场|婚恋|警匪|刑侦|urban|realism|esports|livestream|career|police|wargod/.test(
      text,
    )
  ) {
    return "urban";
  }
  if (
    /古言|宫斗|宅斗|甜宠|总裁|豪门|种田|年代|狗血|替身|现言|言情|民国|女频|穿书|快穿|romance|palace|female|farming|era|sweet|ceo|stand-in/.test(
      text,
    )
  ) {
    return "romance";
  }
  if (
    /规则|怪谈|悬疑|灵异|克苏鲁|黑暗|惊悚|恐怖|rules|suspense|cthulhu|dark|horror/.test(
      text,
    )
  ) {
    return "suspense";
  }
  return "other";
}

function parseCommaSeparated(value: string): ReadonlyArray<string> {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function GenreForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isEdit,
  t,
}: {
  readonly form: GenreFormData;
  readonly onChange: (next: GenreFormData) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly isEdit: boolean;
  readonly t: TFunction;
}) {
  const set = <K extends keyof GenreFormData>(key: K, value: GenreFormData[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-secondary/15 p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <h3 className="font-semibold text-sm">
          {isEdit ? `${t("common.edit")}: ${form.name || form.id}` : t("genre.createNew")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">ID (Slug)</label>
          <input
            type="text"
            value={form.id}
            onChange={(e) => set("id", e.target.value)}
            disabled={isEdit}
            placeholder="e.g. my-custom-genre"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">{t("genre.name")}</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例如：东方玄幻"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">{t("create.language")}</label>
        <select
          value={form.language}
          onChange={(e) => set("language", e.target.value as "zh" | "en")}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="zh">中文 (zh)</option>
          <option value="en">English (en)</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">
          {t("genre.chapterTypes")} ({t("genre.commaSeparated")})
        </label>
        <input
          type="text"
          value={form.chapterTypes}
          onChange={(e) => set("chapterTypes", e.target.value)}
          placeholder="战斗章, 布局章, 过渡章, 收获章"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">
          {t("genre.fatigueWords")} ({t("genre.commaSeparated")})
        </label>
        <input
          type="text"
          value={form.fatigueWords}
          onChange={(e) => set("fatigueWords", e.target.value)}
          placeholder="冷笑, 倒吸凉气, 竟然, 仿佛"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-border/40 bg-background/60 p-3">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.numericalSystem}
            onChange={(e) => set("numericalSystem", e.target.checked)}
            className="rounded"
          />
          {t("genre.numericalSystem")}
        </label>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.powerScaling}
            onChange={(e) => set("powerScaling", e.target.checked)}
            className="rounded"
          />
          {t("genre.powerScaling")}
        </label>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.eraResearch}
            onChange={(e) => set("eraResearch", e.target.checked)}
            className="rounded"
          />
          {t("genre.eraResearch")}
        </label>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">{t("genre.pacingRule")}</label>
        <input
          type="text"
          value={form.pacingRule}
          onChange={(e) => set("pacingRule", e.target.value)}
          placeholder="例如：三章内必有实质性反转与正向反馈"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">{t("genre.rulesMd")}</label>
        <textarea
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          rows={7}
          placeholder="Markdown 详细规则，例如题材禁忌、战力天花板等..."
          className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-xs font-mono outline-none focus:border-primary"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-3.5 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
        >
          {t("genre.cancel")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {isEdit ? t("genre.saveChanges") : t("genre.createNew")}
        </button>
      </div>
    </div>
  );
}

interface Nav {
  toDashboard: () => void;
  toBookCreate?: (genre?: string) => void;
}

export function GenreManager({ nav, theme, t }: { nav: Nav; theme: Theme; t: TFunction }) {
  const c = useColors(theme);
  const { lang } = useI18n();
  const { data, refetch } = useApi<{ genres: ReadonlyArray<GenreInfo> }>("/genres");
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<GenreCategory>("all");
  const [formMode, setFormMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [form, setForm] = useState<GenreFormData>(EMPTY_FORM);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showAllFatigueWords, setShowAllFatigueWords] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const rawGenres = useMemo(() => {
    return data?.genres.filter((g) => g.language === lang || g.source === "project") ?? [];
  }, [data, lang]);

  // Group counts for category badges
  const categoryCounts = useMemo(() => {
    const counts: Record<GenreCategory, number> = {
      all: rawGenres.length,
      fantasy: 0,
      urban: 0,
      romance: 0,
      suspense: 0,
      other: 0,
    };
    for (const g of rawGenres) {
      counts[classifyGenre(g)] += 1;
    }
    return counts;
  }, [rawGenres]);

  const filteredGenres = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rawGenres.filter((g) => {
      if (activeCategory !== "all" && classifyGenre(g) !== activeCategory) {
        return false;
      }
      if (q && !g.name.toLowerCase().includes(q) && !g.id.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rawGenres, activeCategory, searchQuery]);

  // Keep selection valid
  const effectiveSelected = useMemo(() => {
    if (selected && filteredGenres.some((g) => g.id === selected)) {
      return selected;
    }
    return filteredGenres[0]?.id ?? null;
  }, [selected, filteredGenres]);

  const selectedGenre = filteredGenres.find((g) => g.id === effectiveSelected) ?? null;
  const { data: detail } = useApi<GenreDetail>(effectiveSelected ? `/genres/${effectiveSelected}` : "");

  const handleCopy = async (id: string) => {
    try {
      await postApi(`/genres/${id}/copy`);
      setCopiedNotification(id);
      setTimeout(() => setCopiedNotification(null), 8000);
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "复制失败");
    }
  };

  const openCreateForm = () => {
    setForm(EMPTY_FORM);
    setFormMode("create");
  };

  const openEditForm = () => {
    if (!detail) return;
    setForm({
      id: detail.profile.id,
      name: detail.profile.name,
      language: detail.profile.language as "zh" | "en",
      chapterTypes: detail.profile.chapterTypes.join(", "),
      fatigueWords: detail.profile.fatigueWords.join(", "),
      numericalSystem: detail.profile.numericalSystem,
      powerScaling: detail.profile.powerScaling,
      eraResearch: detail.profile.eraResearch ?? false,
      pacingRule: detail.profile.pacingRule,
      body: detail.body,
    });
    setFormMode("edit");
  };

  const closeForm = () => {
    setFormMode("hidden");
  };

  const handleCreate = async () => {
    try {
      await postApi("/genres/create", {
        id: form.id,
        name: form.name,
        language: form.language,
        chapterTypes: parseCommaSeparated(form.chapterTypes),
        fatigueWords: parseCommaSeparated(form.fatigueWords),
        numericalSystem: form.numericalSystem,
        powerScaling: form.powerScaling,
        eraResearch: form.eraResearch,
        pacingRule: form.pacingRule,
        body: form.body,
      });
      setFormMode("hidden");
      setSelected(form.id);
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create genre");
    }
  };

  const handleEdit = async () => {
    if (!effectiveSelected) return;
    try {
      await fetchJson(`/genres/${effectiveSelected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            id: form.id,
            name: form.name,
            language: form.language,
            chapterTypes: parseCommaSeparated(form.chapterTypes),
            fatigueWords: parseCommaSeparated(form.fatigueWords),
            numericalSystem: form.numericalSystem,
            powerScaling: form.powerScaling,
            eraResearch: form.eraResearch,
            pacingRule: form.pacingRule,
          },
          body: form.body,
        }),
      });
      setFormMode("hidden");
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update genre");
    }
  };

  const handleDelete = async () => {
    if (!effectiveSelected) return;
    setConfirmDeleteOpen(false);
    try {
      await fetchJson(`/genres/${effectiveSelected}`, { method: "DELETE" });
      setSelected(null);
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete genre");
    }
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col space-y-3 p-5 overflow-hidden">
      {/* ── Top Bar: Breadcrumb + Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={nav.toDashboard} className="hover:text-foreground transition-colors">
              {t("bread.home")}
            </button>
            <span className="text-border">/</span>
            <span className="text-foreground font-medium">{t("create.genre")}</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">
            共 {rawGenres.length} 套题材
          </span>
        </div>

        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-all"
        >
          <Plus size={14} />
          {t("genre.createNew")}
        </button>
      </div>

      {/* ── Main Master-Detail Viewport (Locked Height) ── */}
      <div className="flex-1 min-h-0 grid grid-cols-[290px_1fr] gap-4">
        {/* ── Left Master: Search + Filter Tabs + Compact List ── */}
        <div className="flex flex-col h-full rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs">
          {/* Search Box */}
          <div className="p-2.5 border-b border-border/50 bg-secondary/10">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-muted-foreground/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索题材名称或 ID..."
                className="w-full rounded-lg border border-border/60 bg-background pl-8 pr-7 py-1.5 text-xs outline-none focus:border-primary/60 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="px-2.5 py-2 border-b border-border/40 bg-secondary/5 flex flex-wrap gap-1">
            {(Object.keys(CATEGORY_MAP) as GenreCategory[]).map((cat) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {CATEGORY_MAP[cat].zh}
                  <span className={`ml-1 opacity-75 text-[10px]`}>
                    ({categoryCounts[cat]})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/20">
            {filteredGenres.map((g) => {
              const isSelected = effectiveSelected === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelected(g.id);
                    if (formMode !== "hidden") setFormMode("hidden");
                  }}
                  className={`group relative flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-secondary/40"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary" />
                  )}
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate text-xs tracking-tight">{g.name}</div>
                    <div className="truncate text-[10.5px] font-mono text-muted-foreground/70">
                      {g.id}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                      g.source === "project"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-secondary text-muted-foreground/80"
                    }`}
                  >
                    {g.source === "project" ? "项目" : "内置"}
                  </span>
                </button>
              );
            })}

            {filteredGenres.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground/60">
                无匹配题材
              </div>
            )}
          </div>
        </div>

        {/* ── Right Detail: Single Smooth Scroll ── */}
        <div className="flex flex-col h-full rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs">
          {formMode !== "hidden" ? (
            <div className="flex-1 overflow-y-auto p-6">
              <GenreForm
                form={form}
                onChange={setForm}
                onSubmit={formMode === "create" ? handleCreate : handleEdit}
                onCancel={closeForm}
                isEdit={formMode === "edit"}
                t={t}
              />
            </div>
          ) : effectiveSelected && detail ? (
            <>
              {/* Detail Sticky Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-secondary/5 shrink-0">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-foreground">
                      {detail.profile.name}
                    </h2>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                      {detail.profile.id}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase">
                      {detail.profile.language}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    {detail.profile.numericalSystem && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        数值系统约束
                      </span>
                    )}
                    {detail.profile.powerScaling && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium">
                        力量等级战力榜
                      </span>
                    )}
                    {detail.profile.eraResearch && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        历史时代考据
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {selectedGenre?.source === "project" ? (
                    <>
                      <button
                        onClick={openEditForm}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 shadow-2xs transition-all"
                      >
                        <Pencil size={13} />
                        {tr("自定义此题材规则", "Edit Project Genre")}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={13} />
                        {t("common.delete")}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleCopy(effectiveSelected)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border/80 bg-background hover:bg-secondary/60 hover:border-primary/40 transition-colors shadow-2xs"
                      title={tr("将只读的系统内置题材复制为项目专有文件，以便进行自由编辑修改", "Copy read-only builtin genre to project for customization")}
                    >
                      <Copy size={13} />
                      {t("genre.copyToProject")}
                    </button>
                  )}
                  {nav.toBookCreate && (
                    <button
                      onClick={() => nav.toBookCreate?.(detail.profile.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-2xs"
                      title={tr(`以此题材（${detail.profile.name}）去创建一部新作品`, "Create book with this genre")}
                    >
                      <Plus size={13} />
                      {tr("以此题材建书", "Use in New Book")}
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Content: Natural Single Scroll (No awkward sub-scrollbars) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* ── 复制成功提示浮层 ── */}
                {copiedNotification === detail.profile.id && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 text-xs leading-relaxed animate-in fade-in duration-300">
                    <div className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-300 text-sm">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={16} />
                        已成功将「{detail.profile.name}」转为项目专有题材！
                      </span>
                      <button
                        onClick={() => setCopiedNotification(null)}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-foreground/90">
                      文件已生成在本地项目的 <code className="px-1.5 py-0.5 bg-background font-mono rounded border border-border/60">genres/{detail.profile.id}.md</code>。
                    </p>
                    <div className="rounded-lg bg-background/80 p-3 border border-border/40 text-muted-foreground space-y-1">
                      <div className="font-semibold text-foreground">💡 它在哪些地方起作用？</div>
                      <div>1. <strong>生效优先级</strong>：项目专有题材（标有“项目”角标）的规则优先级<strong>高于系统内置同名题材</strong>，AI 写书与审校时会优先读它。</div>
                      <div>2. <strong>个性化定制</strong>：点击右上角<strong>「自定义此题材规则」</strong>，可修改该题材的专属禁忌词表、战力规则和节奏要求。</div>
                      <div>3. <strong>新建小说时使用</strong>：创建小说时题材填「{detail.profile.name}」或「{detail.profile.id}」，系统即会自动挂载这套深度规则。</div>
                    </div>
                  </div>
                )}

                {/* ── 项目专有题材状态条 ── */}
                {selectedGenre?.source === "project" && !copiedNotification && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                        项目专有覆盖版
                      </span>
                      <span>
                        当前规则已脱离系统只读预设，存储在本地 <code className="font-mono text-foreground">genres/{detail.profile.id}.md</code>，拥有最高执行优先级。
                      </span>
                    </div>
                    <button
                      onClick={openEditForm}
                      className="text-primary hover:underline font-semibold shrink-0 ml-2"
                    >
                      编辑定制
                    </button>
                  </div>
                )}

                {/* 节奏推进规则 */}
                <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wide">
                    <Flame size={14} />
                    {t("genre.pacingRule")}
                  </div>
                  <div className="text-sm font-medium text-foreground leading-relaxed">
                    {detail.profile.pacingRule || "本题材暂未配置特定节奏规则，按通用长篇节奏执行。"}
                  </div>
                </section>

                {/* 章节类型 */}
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    <BookMarked size={14} />
                    {t("genre.chapterTypes")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.profile.chapterTypes.map((ct) => (
                      <span
                        key={ct}
                        className="px-2.5 py-1 text-xs font-medium bg-secondary text-foreground rounded-lg border border-border/40"
                      >
                        {ct}
                      </span>
                    ))}
                  </div>
                </section>

                {/* 疲劳词 / 禁用套词 */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      <ShieldAlert size={14} />
                      {t("genre.fatigueWords")}
                    </div>
                    {detail.profile.fatigueWords.length > 16 && (
                      <button
                        type="button"
                        onClick={() => setShowAllFatigueWords((v) => !v)}
                        className="text-xs text-primary hover:underline"
                      >
                        {showAllFatigueWords ? "收起" : `展开全部 (${detail.profile.fatigueWords.length})`}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(showAllFatigueWords
                      ? detail.profile.fatigueWords
                      : detail.profile.fatigueWords.slice(0, 16)
                    ).map((w) => (
                      <span
                        key={w}
                        className="px-2 py-0.5 text-xs bg-destructive/10 text-destructive/90 rounded border border-destructive/20"
                      >
                        {w}
                      </span>
                    ))}
                    {!showAllFatigueWords && detail.profile.fatigueWords.length > 16 && (
                      <span className="text-xs text-muted-foreground flex items-center px-1">
                        +{detail.profile.fatigueWords.length - 16}
                      </span>
                    )}
                  </div>
                </section>

                {/* 详细规则正文 (Natural stream view) */}
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    <FileText size={14} />
                    {t("genre.rules")}
                  </div>
                  <div className="rounded-xl border border-border/60 bg-secondary/15 p-5 text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">
                    {detail.body || "—"}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
              <SlidersHorizontal size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm">{t("genre.selectHint")}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t("genre.deleteGenre")}
        message={`${t("genre.confirmDelete")} "${effectiveSelected}"`}
        confirmLabel={t("common.delete") ?? "Delete"}
        cancelLabel={t("genre.cancel") ?? "Cancel"}
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
