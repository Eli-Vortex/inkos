/**
 * Demo dataset for the Novel Creation workbench.
 *
 * This file is the ONLY place sample content lives. It is served through
 * data/adapter.ts and is reachable only while the workbench runs in demo
 * preview mode; the top bar then shows a 演示数据 flag. Saving, reviewing,
 * generating, committing and cancelling in this mode mutate nothing but the
 * in-memory copy below — no real write endpoint is ever called.
 *
 * The works below are fictional: they represent the author's own unpublished
 * manuscripts, so there is no real-world referent to fetch artwork for. Covers
 * are therefore rendered as designed typographic tiles, never as stand-in
 * images of real published books.
 */

import type {
  AnalyticsData,
  Book,
  Candidate,
  Chapter,
  CommitPreview,
  DiagnosticsEntry,
  ExportData,
  OutlineContract,
  ResearchData,
  ReviewItem,
  RuleSetting,
  TaskStep,
  UnavailableCapability,
  WorkTask,
} from "../types";

export interface WorkbenchDataset {
  readonly books: readonly Book[];
  readonly chapters: readonly Chapter[];
  readonly outline: OutlineContract;
  readonly candidates: readonly Candidate[];
  readonly reviewItems: readonly ReviewItem[];
  readonly tasks: readonly WorkTask[];
  readonly research: ResearchData;
  readonly analytics: AnalyticsData;
  readonly export: ExportData;
  readonly rules: readonly RuleSetting[];
  readonly diagnostics: readonly DiagnosticsEntry[];
  readonly unavailable: readonly UnavailableCapability[];
  readonly commitPreview: CommitPreview;
}

const BOOKS: readonly Book[] = [
  {
    id: "b-changye",
    title: "长夜灯河",
    genre: "都市幻想",
    status: "writing",
    governance: { reviewMode: "manual", revisionGate: "strict" },
    chaptersCommitted: 18,
    chaptersPlanned: 24,
    wordCount: 196_400,
    lastEditedAt: "2026-09-16T09:12:00+08:00",
    pendingTaskCount: 2,
    migration: "complete",
  },
  {
    id: "b-jiuzhang",
    title: "九章算术师",
    genre: "历史悬疑",
    status: "review",
    governance: { reviewMode: "manual", revisionGate: "strict" },
    chaptersCommitted: 31,
    chaptersPlanned: 40,
    wordCount: 342_800,
    lastEditedAt: "2026-09-15T22:40:00+08:00",
    pendingTaskCount: 1,
    migration: "complete",
  },
  {
    id: "b-shihuang",
    title: "拾荒者纪年",
    genre: "废土科幻",
    status: "draft",
    governance: { reviewMode: "auto", revisionGate: "lenient" },
    chaptersCommitted: 4,
    chaptersPlanned: 30,
    wordCount: 51_200,
    lastEditedAt: "2026-09-11T14:05:00+08:00",
    pendingTaskCount: 0,
    migration: "complete",
  },
  {
    id: "b-wuzhong",
    title: "雾中客栈",
    genre: "武侠",
    status: "draft",
    governance: { reviewMode: null, revisionGate: null },
    chaptersCommitted: 0,
    chaptersPlanned: 20,
    wordCount: 0,
    lastEditedAt: "2026-09-02T10:20:00+08:00",
    pendingTaskCount: 0,
    migration: "pending",
  },
];

const CHAPTERS: readonly Chapter[] = [
  { id: "c-9", bookId: "b-changye", number: 9, volume: "第一卷 · 灯下无影", title: "老街的第二盏灯", stage: "committed", wordCount: 11_240, updatedAt: "2026-09-08T20:10:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "c-10", bookId: "b-changye", number: 10, volume: "第一卷 · 灯下无影", title: "账房先生的口供", stage: "committed", wordCount: 10_880, updatedAt: "2026-09-11T21:35:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 1 },
  { id: "c-11", bookId: "b-changye", number: 11, volume: "第一卷 · 灯下无影", title: "灯河渡口", stage: "in_review", wordCount: 9_760, updatedAt: "2026-09-16T09:12:00+08:00", outlineApproved: true, outlineDirty: true, staleReview: true, openBlockers: 2, openWarnings: 3 },
  { id: "c-12", bookId: "b-changye", number: 12, volume: "第一卷 · 灯下无影", title: "无人认领的名字", stage: "drafting", wordCount: 3_120, updatedAt: "2026-09-15T19:02:00+08:00", outlineApproved: false, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "c-13", bookId: "b-changye", number: 13, volume: "第一卷 · 灯下无影", title: "雨里的第三个人", stage: "planned", wordCount: 0, updatedAt: "2026-09-14T16:00:00+08:00", outlineApproved: false, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "c-14", bookId: "b-changye", number: 14, volume: "第二卷 · 拾灯人", title: "守灯人的旧约", stage: "planned", wordCount: 0, updatedAt: "2026-09-14T16:00:00+08:00", outlineApproved: false, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "c-15", bookId: "b-changye", number: 15, volume: "第二卷 · 拾灯人", title: "河底的账本", stage: "planned", wordCount: 0, updatedAt: "2026-09-14T16:00:00+08:00", outlineApproved: false, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  // 《九章算术师》在审核中，因此它也要有自己的章节，章节树才不会显示成空书。
  { id: "j-28", bookId: "b-jiuzhang", number: 28, volume: "卷三 · 天元", title: "失传的第九术", stage: "in_review", wordCount: 12_480, updatedAt: "2026-09-15T22:40:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 1, openWarnings: 2 },
  { id: "j-29", bookId: "b-jiuzhang", number: 29, volume: "卷三 · 天元", title: "算学馆的封条", stage: "committed", wordCount: 11_960, updatedAt: "2026-09-13T18:20:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "j-30", bookId: "b-jiuzhang", number: 30, volume: "卷三 · 天元", title: "纸上的第十三个解", stage: "planned", wordCount: 0, updatedAt: "2026-09-12T09:00:00+08:00", outlineApproved: false, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  // 《拾荒者纪年》已提交过 4 章，这里列出其中两章作为已加载的子集。
  { id: "s-3", bookId: "b-shihuang", number: 3, volume: "第一部 · 出坑", title: "锈雨", stage: "committed", wordCount: 13_400, updatedAt: "2026-09-10T11:05:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
  { id: "s-4", bookId: "b-shihuang", number: 4, volume: "第一部 · 出坑", title: "不会说话的收音机", stage: "committed", wordCount: 12_180, updatedAt: "2026-09-11T14:05:00+08:00", outlineApproved: true, outlineDirty: false, staleReview: false, openBlockers: 0, openWarnings: 0 },
];

const CHAPTER_11_BODY = [
  "渡口的灯是天亮前最后一盏还亮着的。",
  "沈砚把那盏灯从桩上取下来的时候，灯芯里爆了一声轻响，像是有人在很远的地方替他应了一句。河面上浮着薄雾，雾里有一线浅白的痕，从对岸一直拖到他脚边，又在离岸三尺的地方停住。",
  "“你来得比昨天早。”撑船的老人没有回头，只把手里的竹篙往水里一沉，“早一刻，河就换一副面孔。”",
  "沈砚没有答话。他蹲下去，把灯放在石阶上，从怀里取出一张对折的账纸。纸角已经被汗浸得发软，上面是账房先生最后写下的那行小字——丁卯年七月十九，灯河渡口，第三个人未到。",
  "“第三个人是谁？”他问。",
  "老人终于转过身来。他脸上没有表情，眼神却像在看一件很久以前就见过的东西。“你手里那张纸，”他说，“是从死人身上拿的吧。”",
  "雾顺着台阶爬上来了，一寸一寸地漫过灯座。沈砚低头去看，灯河里的那线白痕正在慢慢退回去，像是被谁从对岸轻轻拽了一下。",
].join("\n\n");

const CANDIDATES: readonly Candidate[] = [
  {
    id: "cand-formal",
    label: "正式稿 r7",
    revision: 7,
    source: "hand",
    updatedAt: "2026-09-14T23:05:00+08:00",
    baseline: "提交基线 r7",
    wordCount: 9_420,
    body: CHAPTER_11_BODY,
    isFormal: true,
  },
  {
    id: "cand-hand",
    label: "手改候选 r8",
    revision: 8,
    source: "hand",
    updatedAt: "2026-09-16T09:12:00+08:00",
    baseline: "基于正式稿 r7",
    wordCount: 9_760,
    body: CHAPTER_11_BODY,
    isFormal: false,
  },
  {
    id: "cand-gen",
    label: "生成候选 g3",
    revision: 3,
    source: "generated",
    updatedAt: "2026-09-16T08:40:00+08:00",
    baseline: "基于正式稿 r7 · 任务 t-8842",
    wordCount: 10_180,
    body: `${CHAPTER_11_BODY}\n\n（生成本段尚未采纳：撑船老人应当在下一节才交出账本，此处提前了。）`,
    isFormal: false,
  },
  {
    id: "cand-rev",
    label: "修订候选 r8-A",
    revision: 4,
    source: "revised",
    updatedAt: "2026-09-15T22:11:00+08:00",
    baseline: "基于正式稿 r7 · 审核修订",
    wordCount: 9_540,
    body: CHAPTER_11_BODY,
    isFormal: false,
  },
];

const REVIEW_ITEMS: readonly ReviewItem[] = [
  {
    id: "rv-1",
    severity: "block",
    rule: "TIMELINE_CONFLICT",
    ruleGroup: "时间线",
    summary: "本章日期「七月十九」与第 10 章已提交的「七月廿一」冲突。",
    suggestion: "把本章日期改为七月廿一，或回到第 10 章修正账房先生的口供日期。",
    confidence: "high",
    status: "open",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "丁卯年七月十九，灯河渡口，第三个人未到。",
      offset: 214,
    },
    waiverReason: null,
    waivable: false,
  },
  {
    id: "rv-2",
    severity: "block",
    rule: "REQUIRED_BEAT_MISSING",
    ruleGroup: "细纲履约",
    summary: "细纲必达事件「老人交出账本」在本章未出现。",
    suggestion: "补写老人交出账本的动作，或先批准细纲变更再提交。",
    confidence: "high",
    status: "open",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "老人终于转过身来。他脸上没有表情……",
      offset: 612,
    },
    waiverReason: null,
    waivable: false,
  },
  {
    id: "rv-3",
    severity: "warn",
    rule: "PROMISE_OVERDUE",
    ruleGroup: "承诺",
    summary: "第 6 章埋下的承诺「灯芯里的第二道刻痕」已超过约定回收章节。",
    suggestion: "在第 12 章或本章补一处回应，或调整该承诺的回收期限。",
    confidence: "medium",
    status: "open",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "灯芯里爆了一声轻响，像是有人在很远的地方替他应了一句。",
      offset: 96,
    },
    waiverReason: null,
    waivable: true,
  },
  {
    id: "rv-4",
    severity: "warn",
    rule: "CHARACTER_VOICE_DRIFT",
    ruleGroup: "人物",
    summary: "撑船老人的台词长度明显高于其既有语料分布。",
    suggestion: "拆分为两句短句，或确认这是刻意的语域变化。",
    confidence: "medium",
    status: "open",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "早一刻，河就换一副面孔。",
      offset: 148,
    },
    waiverReason: null,
    waivable: true,
  },
  {
    id: "rv-5",
    severity: "suggest",
    rule: "POV_SLIP",
    ruleGroup: "视角",
    summary: "此处出现短暂的第三人称外部视角，本章其余部分为沈砚限知视角。",
    suggestion: "改为沈砚可观察到的外部动作。",
    confidence: "medium",
    status: "open",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "眼神却像在看一件很久以前就见过的东西。",
      offset: 468,
    },
    waiverReason: null,
    waivable: true,
  },
  {
    id: "rv-6",
    severity: "suggest",
    rule: "PACING_DRAG",
    ruleGroup: "节奏",
    summary: "渡口开场连续三段环境描写，进入冲突前停留偏长。",
    suggestion: "合并第二段与第三段的环境描写。",
    confidence: "unknown",
    status: "resolved",
    evidence: {
      chapterId: "c-11",
      chapterLabel: "第 11 章 · 灯河渡口",
      quote: "河面上浮着薄雾，雾里有一线浅白的痕……",
      offset: 62,
    },
    waiverReason: null,
    waivable: true,
  },
  {
    id: "rv-7",
    severity: "block",
    rule: "EVIDENCE_UNAVAILABLE",
    ruleGroup: "证据",
    summary: "第 8 章正文未建立索引，无法核对「守灯人旧约」的引用来源。",
    suggestion: "先完成第 8 章索引任务，再重新运行审核。",
    confidence: "not_applicable",
    status: "open",
    evidence: {
      chapterId: "c-8",
      chapterLabel: "第 8 章 · 未建立索引",
      quote: "（本章索引任务尚未完成，无法引用原文证据）",
      offset: 0,
    },
    waiverReason: null,
    waivable: false,
  },
];

function steps(labels: readonly string[], activeIndex: number, failed = false): readonly TaskStep[] {
  return labels.map((label, index) => ({
    id: `${index}`,
    label,
    state: failed && index === activeIndex
      ? "failed"
      : index < activeIndex
        ? "done"
        : index === activeIndex
          ? "active"
          : "pending",
  }));
}

const TASKS: readonly WorkTask[] = [
  {
    id: "t-8842",
    kind: "生成",
    title: "第 11 章 · 灯河渡口 生成候选",
    target: "长夜灯河 / 第 11 章",
    state: "running",
    progress: 0.62,
    startedAt: "2026-09-16T09:04:00+08:00",
    elapsed: "8 分 12 秒",
    note: "正在生成第二段，已产生 3 个候选片段。",
    steps: steps(["读取细纲与合同", "检索既有章节事实", "生成候选文本", "运行规则自查"], 2),
    cancellable: true,
  },
  {
    id: "t-8839",
    kind: "审核",
    title: "第 11 章 全量审核",
    target: "长夜灯河 / 第 11 章",
    state: "awaiting",
    progress: 1,
    startedAt: "2026-09-16T08:52:00+08:00",
    elapsed: "22 分 40 秒",
    note: "发现 3 条阻断、3 条警告，等待作者处理。",
    steps: steps(["加载规则包", "逐段检查", "汇总结果"], 3),
    cancellable: false,
  },
  {
    id: "t-8830",
    kind: "索引",
    title: "第 8 章 建立索引",
    target: "长夜灯河 / 第 8 章",
    state: "failed",
    progress: 0.34,
    startedAt: "2026-09-15T23:10:00+08:00",
    elapsed: "4 分 02 秒",
    note: "读取章节时返回 503 RECOVERY_REQUIRED，任务已暂停，需先处理待恢复事务。",
    steps: steps(["读取章节文件", "切分段落", "写入索引"], 1, true),
    cancellable: false,
  },
  {
    id: "t-8815",
    kind: "拆书",
    title: "《九章算术师》拆书报告",
    target: "九章算术师 / 全书",
    state: "queued",
    progress: 0,
    startedAt: "",
    elapsed: "等待队列",
    note: "队列中有 2 个任务在前，预计等待 6 分钟。",
    steps: steps(["读取全书", "抽取结构", "生成报告"], 0),
    cancellable: true,
  },
  {
    id: "t-8801",
    kind: "提交",
    title: "第 10 章 提交到正式稿",
    target: "长夜灯河 / 第 10 章",
    state: "done",
    progress: 1,
    startedAt: "2026-09-11T21:30:00+08:00",
    elapsed: "38 秒",
    note: "已提交，投影索引更新中。",
    steps: steps(["校验基线", "写入提交", "更新投影"], 3),
    cancellable: false,
  },
  {
    id: "t-8790",
    kind: "翻译",
    title: "第 1-3 章 英译草稿",
    target: "长夜灯河 / 第 1-3 章",
    state: "canceled",
    progress: 0.18,
    startedAt: "2026-09-10T10:00:00+08:00",
    elapsed: "1 分 12 秒",
    note: "作者已取消，服务端确认取消完成，未产生副作用。",
    steps: steps(["准备术语表", "逐段翻译", "术语校验"], 1),
    cancellable: false,
  },
];

const OUTLINE: OutlineContract = {
  chapterId: "c-11",
  goal: "沈砚在渡口确认「第三个人」的存在，并第一次接近守灯人的旧约。",
  beats: [
    { id: "b-1", text: "沈砚天亮前抵达灯河渡口", mandatory: true, addressed: true },
    { id: "b-2", text: "撑船老人指出账纸来自死者", mandatory: true, addressed: true },
    { id: "b-3", text: "老人交出账本", mandatory: true, addressed: false },
    { id: "b-4", text: "灯河白痕倒退，暗示对岸有人", mandatory: false, addressed: true },
  ],
  characters: [
    { id: "ch-1", name: "沈砚", role: "主角", intent: "查清账房先生之死的第三名在场者" },
    { id: "ch-2", name: "撑船老人", role: "线索持有者", intent: "试探沈砚是否配得上账本" },
  ],
  constraints: [
    { id: "k-1", text: "沈砚在本章仍不得直接看到对岸", kind: "world" },
    { id: "k-2", text: "本章时间不早于第 10 章的七月廿一", kind: "timeline" },
    { id: "k-3", text: "全程沈砚限知视角", kind: "pov" },
    { id: "k-4", text: "环境描写单段不超过 120 字", kind: "style" },
  ],
  approvedRevision: 5,
  currentRevision: 6,
  approvedAt: "2026-09-12T20:18:00+08:00",
  approvedBy: "作者本人",
};

const RESEARCH: ResearchData = {
  materials: [
    {
      id: "m-1",
      title: "灯河渡口地理考",
      kind: "reference",
      source: "地方志摘录（自备素材）",
      collectedAt: "2026-08-30",
      scope: "渡口位置、水位季节变化、旧时守灯制度",
      license: "自备素材，仅本地参考",
      analysisVersion: "分析 v3",
      paragraphs: [
        { id: "m-1-p1", text: "渡口在旧城北门外三里，河面宽约四十丈，冬春之交水浅，可涉水而过。", annotation: "可用于第 11 章的地理一致性核对。" },
        { id: "m-1-p2", text: "守灯制度止于丁卯年，此后灯由附近住户轮流点，无人再记名。", annotation: "与「丁卯年」这条时间线挂钩，注意与第 10 章口供对齐。" },
      ],
    },
    {
      id: "m-2",
      title: "第 1-10 章拆书报告",
      kind: "breakdown",
      source: "本项目生成",
      collectedAt: "2026-09-14",
      scope: "主线推进、伏笔埋设、人物出场密度",
      license: "本项目产物",
      analysisVersion: "分析 v7",
      paragraphs: [
        { id: "m-2-p1", text: "前十章共埋设 9 处伏笔，已回收 4 处，其中 2 处回收超出约定章节。", annotation: "对应承诺列表中 2 条 overdue。" },
        { id: "m-2-p2", text: "账房先生在第 4、7、10 章三次出场，每次台词平均 11 字，语域稳定。", annotation: "可用于判断第 11 章撑船老人台词是否偏离。" },
      ],
    },
    {
      id: "m-3",
      title: "与编辑的沟通记录",
      kind: "interview",
      source: "作者整理",
      collectedAt: "2026-09-02",
      scope: "第一卷节奏与审稿意见",
      license: "自备素材，仅本地参考",
      analysisVersion: "分析 v1",
      paragraphs: [
        { id: "m-3-p1", text: "编辑建议第一卷结尾前收敛两条支线，避免在第二卷继续扩散。", annotation: "影响第 13-15 章的细纲安排。" },
      ],
    },
  ],
  timeline: [
    { id: "tl-1", chapterLabel: "第 6 章", title: "灯芯里的第二道刻痕", detail: "沈砚第一次注意到灯芯上的刻痕，未解其意。", kind: "hook", status: "at_risk", owner: "主线" },
    { id: "tl-2", chapterLabel: "第 7 章", title: "账房先生的第一次拒绝", detail: "账房先生拒绝解释账纸来源。", kind: "promise", status: "paid", owner: "主线" },
    { id: "tl-3", chapterLabel: "第 10 章", title: "账房先生的口供", detail: "交代丁卯年七月廿一在渡口见过三个人。", kind: "payoff", status: "paid", owner: "主线" },
    { id: "tl-4", chapterLabel: "第 11 章", title: "第三个人未到", detail: "账纸上的小字与口供日期冲突。", kind: "hook", status: "open", owner: "主线" },
    { id: "tl-5", chapterLabel: "第 14 章", title: "守灯人的旧约", detail: "计划揭示旧约内容，需先落定渡口线索。", kind: "promise", status: "open", owner: "支线" },
  ],
  promises: [
    { id: "p-1", text: "灯芯里的第二道刻痕会被解释", plantedAt: "第 6 章", dueBy: "第 12 章", status: "at_risk", evidence: "第 6 章正文首次出现刻痕描写。" },
    { id: "p-2", text: "老账本会被交到沈砚手上", plantedAt: "第 10 章", dueBy: "第 11 章", status: "open", evidence: "第 10 章口供末尾提到账本仍在渡口。" },
    { id: "p-3", text: "对岸的身份会被揭开", plantedAt: "第 3 章", dueBy: "第 18 章", status: "open", evidence: "第 3 章沈砚第一次望见对岸灯火。" },
  ],
  m3: [
    { chapterLabel: "第 6 章", net: 0.4, verdict: "ok", note: "支线推进，主线持平。" },
    { chapterLabel: "第 7 章", net: 1.1, verdict: "ok", note: "冲突升起，主线收益明确。" },
    { chapterLabel: "第 8 章", net: 0, verdict: "insufficient_data", note: "本章尚未建立索引，无法计算。" },
    { chapterLabel: "第 9 章", net: 0.7, verdict: "ok", note: "回收一处伏笔，新增一处。" },
    { chapterLabel: "第 10 章", net: 1.6, verdict: "ok", note: "关键口供落地。" },
    { chapterLabel: "第 11 章", net: -0.3, verdict: "warn", note: "本章新增伏笔多于回收，且必达事件未完成。" },
    { chapterLabel: "第 12 章", net: 0, verdict: "unverifiable", note: "草稿未完成，模型无法判断。" },
    { chapterLabel: "第 13 章", net: 0, verdict: "not_applicable", note: "尚未开始，规则不适用。" },
  ],
};

const ANALYTICS: AnalyticsData = {
  currentChapter: 11,
  continuity: [
    {
      id: "ct-1",
      chapterId: "c-11",
      chapterLabel: "第 11 章",
      subject: "丁卯年渡口日期",
      conflict: "timeline",
      verdict: "block",
      before: "第 10 章口供：丁卯年七月廿一，渡口见过三个人",
      after: "第 11 章账纸：丁卯年七月十九，灯河渡口，第三个人未到",
      note: "同一事件在两个章节里落到相差两天的日期上，且两个版本都是角色亲笔/亲口所述，无法用叙述不可靠解释。",
      quote: "纸角已经被汗浸得发软，上面是账房先生最后写下的那行小字——丁卯年七月十九，灯河渡口，第三个人未到。",
      offset: 232,
    },
    {
      id: "ct-2",
      chapterId: "c-11",
      chapterLabel: "第 11 章",
      subject: "账房先生的语域",
      conflict: "persona",
      verdict: "warn",
      before: "第 4 / 7 / 10 章：台词平均 11 字，句式短、不用比喻",
      after: "第 11 章转述：出现「像有人在很远的地方替他应了一句」这类比喻",
      note: "转述与直接台词之间的语域漂移，属提示性差异；若确为沈砚的主观转述可保留。",
      quote: "沈砚把那盏灯从桩上取下来的时候，灯芯里爆了一声轻响，像是有人在很远的地方替他应了一句。",
      offset: 46,
    },
    {
      id: "ct-3",
      chapterId: "c-11",
      chapterLabel: "第 11 章",
      subject: "撑船老人的身份边界",
      conflict: "power",
      verdict: "warn",
      before: "第 3 章设定：渡口撑船人不识字、不识账",
      after: "第 11 章：撑船老人一眼认出账纸的来历与出处",
      note: "能力边界与「认字」设定冲突；若老人另有旧约身份，需要在本章或下一章给出交代。",
      quote: "“你手里那张纸，”他说，“是从死人身上拿的吧。”",
      offset: 402,
    },
    {
      id: "ct-4",
      chapterId: "c-10",
      chapterLabel: "第 10 章",
      subject: "灯芯第二道刻痕",
      conflict: "timeline",
      verdict: "ok",
      before: "第 6 章首次出现刻痕描写，未解释",
      after: "第 10 章口供未提前解释，仍保持悬置",
      note: "悬置状态与细纲 r6 的回收计划（第 12 章）一致。",
      quote: "交代丁卯年七月廿一在渡口见过三个人。",
      offset: 0,
    },
    {
      id: "ct-5",
      chapterId: "c-13",
      chapterLabel: "第 13 章",
      subject: "雨里的第三个人",
      conflict: "timeline",
      verdict: "insufficient_data",
      before: "第 12 章草稿未完成，尚未进入审核",
      after: "第 13 章仅有细纲，无正文",
      note: "本章尚未落文，无法核对；不按 0 分或通过处理。",
      quote: "（本章尚无正文，仅有细纲条目。）",
      offset: 0,
    },
  ],
  promises: [
    {
      id: "np-1",
      text: "灯芯里的第二道刻痕会被解释",
      stage: "advanced",
      plantedAt: "第 6 章",
      dueBy: "第 12 章",
      chapterLabel: "第 11 章",
      evidence: "第 11 章灯芯爆响，刻痕被再次触碰但未解释——属于推进而非兑现。",
      offset: 46,
    },
    {
      id: "np-2",
      text: "老账本会被交到沈砚手上",
      stage: "introduced",
      plantedAt: "第 10 章",
      dueBy: "第 11 章",
      chapterLabel: "第 10 章",
      evidence: "第 10 章口供末尾提到账本仍在渡口；第 11 章只出现账纸，账本未交付。",
      offset: 0,
    },
    {
      id: "np-3",
      text: "对岸的身份会被揭开",
      stage: "introduced",
      plantedAt: "第 3 章",
      dueBy: "第 18 章",
      chapterLabel: "第 3 章",
      evidence: "第 3 章沈砚第一次望见对岸灯火；此后只在灯河白痕里被侧面提及。",
      offset: 0,
    },
    {
      id: "np-4",
      text: "撑船老人与守灯旧约的关系",
      stage: "advanced",
      plantedAt: "第 11 章",
      dueBy: "第 14 章",
      chapterLabel: "第 11 章",
      evidence: "第 11 章老人认出账纸来历，暗示他见过更早的一批人。",
      offset: 402,
    },
    {
      id: "np-5",
      text: "「第三个人」是谁",
      stage: "deferred",
      plantedAt: "第 11 章",
      dueBy: "第 13 章",
      chapterLabel: "第 11 章",
      evidence: "第 11 章抛出该问题后立即被雾与白痕打断，作者已将其在细纲 r6 中顺延到第 13 章。",
      offset: 356,
    },
    {
      id: "np-6",
      text: "河底沉船的货单",
      stage: "abandoned",
      plantedAt: "第 8 章",
      dueBy: "第 10 章",
      chapterLabel: "第 8 章",
      evidence: "第 8 章之后未再出现；细纲 r6 已删除该条目，此处保留为已放弃记录。",
      offset: 0,
    },
  ],
  debts: [
    { id: "debt-1", chapter: 9, type: "suppression", sourceContext: "沈砚在灯市被巡吏当众扣下灯牌，一句未辩", expectedPaybackType: "slap_face", dueChapter: 11, status: "pending" },
    { id: "debt-2", chapter: 10, type: "foreshadowing", sourceContext: "账房先生口供里的「第三个人」始终没有名字", expectedPaybackType: "reveal", dueChapter: 13, status: "pending" },
    { id: "debt-3", chapter: 7, type: "antagonist_insult", sourceContext: "馆丞当众讥讽沈砚的算学历是抄来的", expectedPaybackType: "power_breakthrough", dueChapter: 12, status: "pending" },
    { id: "debt-4", chapter: 8, type: "payoff_delay", sourceContext: "河底货单线索被搁置，其后三章未再推进", expectedPaybackType: "loot_gain", dueChapter: 11, status: "pending" },
    { id: "debt-5", chapter: 6, type: "suppression", sourceContext: "沈砚错过与母亲最后一面的约定", expectedPaybackType: "reveal", dueChapter: 10, status: "fulfilled", fulfilledChapter: 10, notes: "第 10 章口供间接回收。" },
    { id: "debt-6", chapter: 5, type: "antagonist_insult", sourceContext: "账房先生拒绝承认旧账本属于沈家", expectedPaybackType: "slap_face", dueChapter: 9, status: "fulfilled", fulfilledChapter: 9 },
    { id: "debt-7", chapter: 4, type: "foreshadowing", sourceContext: "对岸灯火三长两短的信号", expectedPaybackType: "reveal", dueChapter: 9, status: "cancelled", notes: "细纲 r6 改为第二卷展开。" },
  ],
  pacingAlerts: [
    "第 11 章已到期未兑现的债务有 4 笔，其中 2 笔原本约定在第 11 章之前回收。",
    "第 8 章索引未建立，该章净值无法计算，所有统计按「缺少数据」处理。",
    "第 12 章草稿未完成，模型无法判断本章节奏；不按 0 分计入曲线。",
  ],
};

const EXPORT_DATA: ExportData = {
  head: "正式稿 r7",
  headCommitId: "commit-demo-8801",
  submittedChapters: 2,
  candidateChapters: 1,
  preview: [
    {
      id: "ex-9",
      chapterLabel: "第 9 章",
      heading: "老街的第二盏灯",
      body: "老街的灯是一盏一盏熄的。沈砚数到第七盏的时候，账房先生从暗处走了出来。",
      submitted: true,
    },
    {
      id: "ex-10",
      chapterLabel: "第 10 章",
      heading: "账房先生的口供",
      body: "交代丁卯年七月廿一在渡口见过三个人。第三个人没有名字，只有一双被水泡过的手。",
      submitted: true,
    },
    {
      id: "ex-11",
      chapterLabel: "第 11 章",
      heading: "灯河渡口",
      body: "渡口的灯是天亮前最后一盏还亮着的。沈砚把那盏灯从桩上取下来的时候，灯芯里爆了一声轻响。",
      submitted: false,
    },
  ],
  history: [
    { id: "eh-1", format: "epub", scopeLabel: "已提交章节（2 章）", head: "正式稿 r7", createdAt: "2026-09-15 21:40", includesCandidates: false, artifact: "长夜灯河_已提交_r7.epub", state: "ready" },
    { id: "eh-2", format: "md", scopeLabel: "已提交章节（2 章）", head: "正式稿 r6", createdAt: "2026-09-12 09:05", includesCandidates: false, artifact: "长夜灯河_已提交_r6.md", state: "ready" },
    { id: "eh-3", format: "txt", scopeLabel: "含候选稿（3 章）· 未提交", head: "正式稿 r7", createdAt: "2026-09-11 23:18", includesCandidates: true, artifact: "长夜灯河_含候选_r7.txt", state: "failed" },
  ],
};

const RULES: readonly RuleSetting[] = [
  { id: "r-1", name: "时间线一致性", group: "世界与时间", severity: "block", enabled: true, source: "内置规则包 v4" },
  { id: "r-2", name: "细纲必达事件履约", group: "细纲履约", severity: "block", enabled: true, source: "内置规则包 v4" },
  { id: "r-3", name: "承诺回收期限", group: "承诺", severity: "warn", enabled: true, source: "项目自定义" },
  { id: "r-4", name: "人物语域漂移", group: "人物", severity: "warn", enabled: true, source: "内置规则包 v4" },
  { id: "r-5", name: "视角越界", group: "视角", severity: "suggest", enabled: true, source: "内置规则包 v3" },
  { id: "r-6", name: "节奏拖沓", group: "节奏", severity: "suggest", enabled: false, source: "项目自定义" },
];

const DIAGNOSTICS: readonly DiagnosticsEntry[] = [
  { id: "d-1", label: "项目配置", state: "ok", detail: "项目配置文件存在且可解析，语言已显式设置。" },
  { id: "d-2", label: "提交链完整性", state: "ok", detail: "最近一次提交 t-8801 已落盘，投影更新中。" },
  { id: "d-3", label: "待恢复事务", state: "block", detail: "第 8 章索引任务停在 503 RECOVERY_REQUIRED，需要先执行恢复流程。" },
  { id: "d-4", label: "规则包版本", state: "warn", detail: "项目规则包 v4 落后于内置 v5，可能新增两条阻断规则。" },
  { id: "d-5", label: "向量索引", state: "warn", detail: "8 / 18 章已建立索引，其余章节的引用核对会退化为不可判断。" },
  { id: "d-6", label: "模型连接", state: "unavailable", detail: "本轮为前端预览，未发起任何真实模型请求。" },
];

const UNAVAILABLE: readonly UnavailableCapability[] = [
  { id: "u-1", label: "真实保存与提交", reason: "写作工作区的保存/提交只改内存演示状态；真实写入需接入提交接口。" },
  { id: "u-2", label: "云端审核", reason: "审核结果为演示数据，未调用任何付费审核。" },
  { id: "u-3", label: "生成流式输出", reason: "SSE 事件流未接入，生成区只展示静态候选。" },
  { id: "u-4", label: "版本冲突自动合并", reason: "冲突态可演示，但差异合并没有后端支持。" },
  { id: "u-5", label: "本地崩溃恢复稿", reason: "IndexedDB 恢复稿未实现。" },
  { id: "u-6", label: "导出与打印", reason: "本轮不产出导出文件。" },
];

const COMMIT_PREVIEW: CommitPreview = {
  candidateId: "cand-hand",
  baseline: "第 11 章 正式稿 r7",
  wordDelta: 340,
  statusChange: "审核中 → 已批准",
  gates: [
    { id: "g-1", label: "阻断项已全部处理", state: "block", detail: "3 条阻断项仍未处理（时间线冲突、必达事件缺失、证据不可用）。" },
    { id: "g-2", label: "细纲合同已批准", state: "warn", detail: "细纲 r6 相对已批准的 r5 有未批准变更。" },
    { id: "g-3", label: "候选基线未过期", state: "warn", detail: "审核结果产生于 r7 基线，候选 r8 修改后审核已过期。" },
    { id: "g-4", label: "索引任务已完成", state: "block", detail: "第 8 章索引任务失败，引用核对不完整。" },
  ],
  pendingIndexTasks: ["第 8 章 建立索引（失败待恢复）", "第 9、10 章 增量索引（排队中）"],
  removable: true,
};

export const NORMAL_DATASET: WorkbenchDataset = {
  books: BOOKS,
  chapters: CHAPTERS,
  outline: OUTLINE,
  candidates: CANDIDATES,
  reviewItems: REVIEW_ITEMS,
  tasks: TASKS,
  research: RESEARCH,
  analytics: ANALYTICS,
  export: EXPORT_DATA,
  rules: RULES,
  diagnostics: DIAGNOSTICS,
  unavailable: UNAVAILABLE,
  commitPreview: COMMIT_PREVIEW,
};

/**
 * The demo "empty" scenario.
 *
 * Every collection is zeroed to mirror `emptyWorkbenchDataset()`: this used to
 * spread NORMAL_DATASET, so the "empty" demo still carried the normal outline,
 * rules, diagnostics and commit preview — a fiction that could mask real
 * empty-state bugs.
 */
export const EMPTY_DATASET: WorkbenchDataset = {
  books: [],
  chapters: [],
  outline: {
    chapterId: "",
    goal: "",
    beats: [],
    characters: [],
    constraints: [],
    approvedRevision: null,
    currentRevision: 0,
    approvedAt: null,
    approvedBy: null,
  },
  candidates: [],
  reviewItems: [],
  tasks: [],
  research: { materials: [], timeline: [], promises: [], m3: [] },
  analytics: { currentChapter: 0, continuity: [], promises: [], debts: [], pacingAlerts: [] },
  export: { head: "", headCommitId: "", submittedChapters: 0, candidateChapters: 0, preview: [], history: [] },
  rules: [],
  diagnostics: [],
  unavailable: [],
  commitPreview: {
    candidateId: "",
    baseline: "",
    wordDelta: 0,
    statusChange: "",
    gates: [],
    pendingIndexTasks: [],
    removable: false,
  },
};

/** Per-scenario overrides applied on top of the normal dataset. */
export function datasetFor(scenario: string): WorkbenchDataset {
  if (scenario === "empty") return EMPTY_DATASET;
  if (scenario === "conflict") {
    return {
      ...NORMAL_DATASET,
      candidates: NORMAL_DATASET.candidates.map((c) =>
        c.id === "cand-hand" ? { ...c, revision: 8, baseline: "基线已被服务端更新为 r9" } : c,
      ),
    };
  }
  if (scenario === "stale") {
    return {
      ...NORMAL_DATASET,
      chapters: NORMAL_DATASET.chapters.map((c) =>
        c.id === "c-10" ? { ...c, staleReview: true, openWarnings: 2 } : c,
      ),
    };
  }
  if (scenario === "recovering") {
    return {
      ...NORMAL_DATASET,
      diagnostics: NORMAL_DATASET.diagnostics.map((d) =>
        d.id === "d-3" ? { ...d, state: "warn" as const, detail: "恢复流程进行中：已回滚到安全基线，等待重新索引。" } : d,
      ),
    };
  }
  return NORMAL_DATASET;
}

