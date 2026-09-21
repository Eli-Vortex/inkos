/**
 * Novel Creation Deslop Linter & Anti-AI Detector
 *
 * Integrated from Oh Story's story-deslop engine.
 * Scans text for high-risk AI-flavored patterns, formulaic clichés,
 * and pseudo-profound summaries before final acceptance.
 */

export interface DeslopFinding {
  type: "blocking" | "advisory";
  rule: string;
  snippet: string;
  suggestion: string;
}

export interface DeslopReport {
  passed: boolean;
  blockingCount: number;
  advisoryCount: number;
  findings: DeslopFinding[];
}

export class DeslopLinter {
  private static readonly BLOCKING_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    suggestion: string;
  }> = [
    {
      name: "not-is-comparison (否定前置反转)",
      regex: /(?:不是|并未|没有)[^，,。！？!?\n]{1,30}[，,](?:而是|只是|仅仅是)[^。！？!?\n]{1,30}/g,
      suggestion: "直接写肯定的事实与动作，删去多余的否定对比铺垫。",
    },
    {
      name: "trailer-ending (预告式总结收尾)",
      regex: /(?:没人知道|没有人知道|才刚刚开始|命运的齿轮|这一切都结束了)[^。\n]{0,20}[。\n]/g,
      suggestion: "去掉空洞的假大空结语，以具体的场景动作或悬念动作自然收尾。",
    },
    {
      name: "voice-contrast (音量反差腔)",
      regex: /(?:声音|语调)(?:不大|不高|很轻|平静)[^，,。！？!?\n]{0,10}[，,](?:却|但)[^。！？!?\n]{1,30}/g,
      suggestion: "删除'声音不大却'的格式化反差，直接写人物说话的内容与行动。",
    },
  ];

  private static readonly ADVISORY_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    suggestion: string;
  }> = [
    {
      name: "cliche-density (高频AI套词)",
      regex: /(?:倒吸了一口凉气|冷笑一声|嘴角勾起一抹|眼中闪过一丝|暗暗心惊|仿佛在诉说着)/g,
      suggestion: "替换为具体的人物神态、实际心理或外部环境反馈。",
    },
    {
      name: "abstract-summary (空泛感悟)",
      regex: /(?:这一刻，.*终于明白|他知道，这意味着|必须承认)/g,
      suggestion: "通过具体事件或证据让读者自行体会，避免作者/叙述者跳出来总结升华。",
    },
    {
      name: "em-dash-abuse (破折号过度转折)",
      regex: /——[^——\n]{2,40}——/g,
      suggestion: "改用正规标点或拆解为自然句，减少戏剧性破折号。",
    },
  ];

  /**
   * Scans a chapter text and returns a structured DeslopReport.
   */
  public static scan(text: string): DeslopReport {
    const findings: DeslopFinding[] = [];

    // Scan Blocking Rules
    for (const rule of this.BLOCKING_PATTERNS) {
      const matches = text.match(rule.regex);
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "blocking",
            rule: rule.name,
            snippet: match.trim(),
            suggestion: rule.suggestion,
          });
        }
      }
    }

    // Scan Advisory Rules
    for (const rule of this.ADVISORY_PATTERNS) {
      const matches = text.match(rule.regex);
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "advisory",
            rule: rule.name,
            snippet: match.trim(),
            suggestion: rule.suggestion,
          });
        }
      }
    }

    const blockingCount = findings.filter((f) => f.type === "blocking").length;
    const advisoryCount = findings.filter((f) => f.type === "advisory").length;

    return {
      passed: blockingCount === 0,
      blockingCount,
      advisoryCount,
      findings,
    };
  }
}
