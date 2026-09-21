/**
 * Chapter tree — the collapsible navigation column of the writing workspace.
 *
 * Chapters are grouped by volume, each row carries its lifecycle stage as a
 * text label (never colour alone), and unsaved/conflicting chapters are called
 * out so switching away is a deliberate choice.
 */

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Chapter, ChapterStage } from "../types";
import { Badge, IconButton, type Tone } from "../ui";

const STAGE: Record<ChapterStage, { label: string; tone: Tone }> = {
  planned: { label: "待写", tone: "neutral" },
  drafting: { label: "草稿", tone: "info" },
  in_review: { label: "审核中", tone: "warn" },
  approved: { label: "已批准", tone: "brand" },
  committed: { label: "已提交", tone: "ok" },
};

export interface ChapterTreeProps {
  readonly chapters: readonly Chapter[];
  readonly activeChapterId: string | null;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onSelect: (chapterId: string) => void;
  readonly onNewChapter: () => void;
  readonly dirtyChapterId: string | null;
}

export function ChapterTree({
  chapters,
  activeChapterId,
  collapsed,
  onToggle,
  onSelect,
  onNewChapter,
  dirtyChapterId,
}: ChapterTreeProps) {
  const volumes = groupByVolume(chapters);
  // Fold state is pure presentation: collapsing a volume must never touch the
  // store, the selection, or the editor buffer.
  const [collapsedVolumes, setCollapsedVolumes] = useState<ReadonlySet<string>>(() => new Set());
  const toggleVolume = (volume: string) => {
    setCollapsedVolumes((current) => {
      const next = new Set(current);
      if (next.has(volume)) next.delete(volume);
      else next.add(volume);
      return next;
    });
  };

  if (collapsed) {
    return (
      <nav className="nc-tree" data-collapsed="true" aria-label="章节树（已收起）">
        <div className="nc-tree-head">
          <IconButton label="展开章节树" icon={<ChevronRight size={15} />} onClick={onToggle} />
        </div>
      </nav>
    );
  }

  return (
    <nav className="nc-tree" aria-label="章节树">
      <div className="nc-tree-head">
        <span className="nc-label" style={{ flex: 1 }}>章节</span>
        <IconButton label="新建章节" icon={<Plus size={15} />} onClick={onNewChapter} />
        <IconButton label="收起章节树" icon={<ChevronLeft size={15} />} onClick={onToggle} />
      </div>
      <div className="nc-tree-body">
        {volumes.map(([volume, items]) => {
          const folded = collapsedVolumes.has(volume);
          const blocked = items.filter((chapter) => chapter.openBlockers > 0).length;
          return (
            <section className="nc-volume" key={volume} data-collapsed={folded}>
              <button
                type="button"
                className="nc-volume-head"
                aria-expanded={!folded}
                onClick={() => toggleVolume(volume)}
                title={folded ? `展开${volume}` : `收起${volume}`}
              >
                <span className="nc-volume-chevron" aria-hidden="true"><ChevronDown size={13} /></span>
                <span className="nc-volume-name">{volume}</span>
                {blocked > 0 && <Badge tone="block" title={`${blocked} 个章节仍有阻断项`}>{blocked}</Badge>}
                <span className="nc-volume-count">{items.length} 章</span>
              </button>
              {!folded && (
                <div className="nc-volume-body">
                  {items.map((chapter) => {
                    const stage = STAGE[chapter.stage];
                    const isActive = chapter.id === activeChapterId;
                    const isDirty = chapter.id === dirtyChapterId;
                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        className="nc-chapter"
                        aria-current={isActive}
                        onClick={() => onSelect(chapter.id)}
                        title={chapter.title}
                      >
                        <span className="nc-chapter-no">{String(chapter.number).padStart(2, "0")}</span>
                        <span className="nc-chapter-title">{chapter.title}</span>
                        <span className="nc-chapter-badges">
                          {isDirty && <Badge tone="warn" title="本章有未保存的改动">未保存</Badge>}
                          {chapter.staleReview && !isDirty && <Badge tone="warn" title="正文在最后一次审核后已改动，需要重新审核">待重审</Badge>}
                          {chapter.openBlockers > 0 && (
                            <Badge tone="block" title={`${chapter.openBlockers} 条阻断项`}>{chapter.openBlockers}</Badge>
                          )}
                          {chapter.openWarnings > 0 && chapter.openBlockers === 0 && (
                            <Badge tone="warn" title={`${chapter.openWarnings} 条需确认的警告`}>
                              {chapter.openWarnings} 警告
                            </Badge>
                          )}
                          {!isDirty && !chapter.staleReview && chapter.openBlockers === 0
                            && chapter.openWarnings === 0 && (
                            <Badge tone={stage.tone}>{stage.label}</Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

function groupByVolume(chapters: readonly Chapter[]): Array<[string, Chapter[]]> {
  const map = new Map<string, Chapter[]>();
  for (const chapter of chapters) {
    const list = map.get(chapter.volume);
    if (list) list.push(chapter);
    else map.set(chapter.volume, [chapter]);
  }
  return Array.from(map.entries());
}

export function chapterStageLabel(stage: ChapterStage): string {
  return STAGE[stage].label;
}
