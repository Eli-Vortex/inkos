/**
 * Novel Creation Pacing & Emotional Debt Engine
 *
 * Integrated from Webnovel Writer's pacing-control and debt models.
 * Tracks hook debt, conflict suppressions, cool-point payoffs, and pacing rhythm.
 */

export type DebtStatus = "pending" | "fulfilled" | "overdue" | "cancelled";

export interface EmotionalDebtRecord {
  id: string;
  chapter: number;
  type: "suppression" | "foreshadowing" | "antagonist_insult" | "payoff_delay";
  sourceContext: string;
  expectedPaybackType: "slap_face" | "reveal" | "power_breakthrough" | "loot_gain";
  dueChapter: number;
  status: DebtStatus;
  fulfilledChapter?: number;
  notes?: string;
}

export interface PacingState {
  currentChapter: number;
  unresolvedDebts: EmotionalDebtRecord[];
  recentPayoffFrequency: number; // number of payoffs in last 5 chapters
  pacingAlerts: string[];
}

export class PacingDebtEngine {
  /**
   * Evaluates if there is an overdue emotional debt that MUST be paid off in the next chapter.
   */
  public static evaluateDebt(
    debts: EmotionalDebtRecord[],
    currentChapter: number
  ): {
    mustPayoff: boolean;
    urgentDebts: EmotionalDebtRecord[];
    pacingScore: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const urgentDebts = debts.filter(
      (d) => d.status === "pending" && currentChapter >= d.dueChapter
    );

    if (urgentDebts.length > 0) {
      warnings.push(
        `【追读力预警】当前第 ${currentChapter} 章已有 ${urgentDebts.length} 笔情绪债务逾期未兑现！`
      );
      urgentDebts.forEach((d) => {
        warnings.push(
          `  - 债务 [${d.type}]: ${d.sourceContext}，应在第 ${d.dueChapter} 章前兑现 [${d.expectedPaybackType}]`
        );
      });
    }

    const pendingCount = debts.filter((d) => d.status === "pending").length;
    if (pendingCount >= 4) {
      warnings.push(
        `【压抑度过高】当前积压了 ${pendingCount} 笔悬念/受挫债务，下一章强烈建议安排即时小爽点或微兑现。`
      );
    }

    const pacingScore = Math.max(0, 100 - urgentDebts.length * 25 - pendingCount * 5);

    return {
      mustPayoff: urgentDebts.length > 0,
      urgentDebts,
      pacingScore,
      warnings,
    };
  }

  /**
   * Generates prompt constraints based on the emotional debt state.
   */
  public static generatePacingPromptConstraint(
    debts: EmotionalDebtRecord[],
    currentChapter: number
  ): string {
    const evalResult = this.evaluateDebt(debts, currentChapter);
    if (!evalResult.mustPayoff && evalResult.warnings.length === 0) {
      return "";
    }

    let instruction = `\n### 【追读力与情绪债务约束】\n`;
    for (const w of evalResult.warnings) {
      instruction += `- ${w}\n`;
    }

    if (evalResult.mustPayoff) {
      instruction += `- **硬性要求**：本章必须针对以下至少一项逾期债务进行实质性偿还/打脸/逆袭，严禁继续纯吃瘪：\n`;
      for (const d of evalResult.urgentDebts) {
        instruction += `  * 偿还：${d.sourceContext} -> 实施【${d.expectedPaybackType}】\n`;
      }
    }

    return instruction;
  }
}
