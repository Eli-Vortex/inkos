// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TransitionDialog } from "./TransitionDialog";
import { ReviewPanel } from "./ReviewPanel";
import { useWorkbench } from "../state/store";
import type { ReviewItem } from "../types";

afterEach(cleanup);

describe("TransitionDialog", () => {
  beforeEach(() => {
    useWorkbench.setState({ pendingTransition: null, transitionGuard: null });
  });

  it("renders nothing when no transition is parked", () => {
    const { container } = render(<TransitionDialog />);
    expect(container.firstChild).toBeNull();
  });

  it("names what is about to happen and offers save / discard / stay", () => {
    useWorkbench.setState({
      pendingTransition: { description: "切换到章节", run: vi.fn() },
      transitionGuard: { hasUnsavedWork: () => true, save: vi.fn(async () => true) },
    });
    render(<TransitionDialog />);

    expect(screen.getByText(/切换到章节/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /保存并继续/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /放弃改动并继续/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /留在当前页/ })).toBeTruthy();
  });

  it("saves and then runs the parked transition", async () => {
    const run = vi.fn();
    const save = vi.fn(async () => true);
    useWorkbench.setState({
      pendingTransition: { description: "切换章节", run },
      transitionGuard: { hasUnsavedWork: () => true, save },
    });
    render(<TransitionDialog />);

    fireEvent.click(screen.getByRole("button", { name: /保存并继续/ }));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the author in place when the save fails", async () => {
    const run = vi.fn();
    useWorkbench.setState({
      pendingTransition: { description: "切换章节", run },
      transitionGuard: { hasUnsavedWork: () => true, save: vi.fn(async () => false) },
    });
    render(<TransitionDialog />);

    fireEvent.click(screen.getByRole("button", { name: /保存并继续/ }));
    await vi.waitFor(() => expect(useWorkbench.getState().pendingTransition).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });

  it("cancelling neither saves nor navigates", async () => {
    const run = vi.fn();
    const save = vi.fn(async () => true);
    useWorkbench.setState({
      pendingTransition: { description: "切换章节", run },
      transitionGuard: { hasUnsavedWork: () => true, save },
    });
    render(<TransitionDialog />);

    fireEvent.click(screen.getByRole("button", { name: /留在当前页/ }));
    await vi.waitFor(() => expect(useWorkbench.getState().pendingTransition).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});

const item = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "contract.outline.missing.abc",
  severity: "warn",
  rule: "contract.outline.thin-constraints",
  ruleGroup: "审计",
  summary: "细纲没有硬约束",
  suggestion: "补充至少一条",
  confidence: "high",
  status: "open",
  evidence: { chapterId: "b1-ch-3", chapterLabel: "第 3 章", quote: "标题", offset: 0 },
  waiverReason: null,
  waivable: true,
  ...overrides,
});

describe("ReviewPanel waiving", () => {
  it("requires a reason before a finding can be waived", () => {
    const onWaive = vi.fn();
    render(
      <ReviewPanel
        items={[item()]}
        filter={{ severity: "all", status: "open", query: "" }}
        onFilter={vi.fn()}
        onResolve={vi.fn()}
        onWaive={onWaive}
        onLocate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /按误报豁免/ }));
    const submit = screen.getByRole("button", { name: /提交豁免/ });

    // No reason at all.
    fireEvent.click(submit);
    expect(onWaive).not.toHaveBeenCalled();

    // A reason too short to be a decision.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "好" } });
    fireEvent.click(submit);
    expect(onWaive).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "该语域变化是刻意的" } });
    fireEvent.click(submit);
    expect(onWaive).toHaveBeenCalledWith(item().id, "该语域变化是刻意的");
  });

  it("refuses to offer a waiver for a finding that cannot be waived", () => {
    render(
      <ReviewPanel
        items={[item({ waivable: false, rule: "legacy.audit" })]}
        filter={{ severity: "all", status: "open", query: "" }}
        onFilter={vi.fn()}
        onResolve={vi.fn()}
        onWaive={vi.fn()}
        onLocate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /按误报豁免/ })).toBeNull();
    expect(screen.getByText(/硬性错误不可豁免/)).toBeTruthy();
  });

  it("reflects the unverified state instead of calling it pending", () => {
    render(
      <ReviewPanel
        items={[item({ status: "unverified", severity: "block", summary: "去 AI 味检查未完成" })]}
        filter={{ severity: "all", status: "all", query: "" }}
        onFilter={vi.fn()}
        onResolve={vi.fn()}
        onWaive={vi.fn()}
        onLocate={vi.fn()}
      />,
    );
    expect(screen.getByText("未验证")).toBeTruthy();
  });
});
