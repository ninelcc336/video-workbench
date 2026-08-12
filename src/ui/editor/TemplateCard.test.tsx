// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EffectFamilyDefinition } from "../../domain/templates/types";
import { TemplateCard } from "./TemplateCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createTemplate(render: EffectFamilyDefinition["render"]): EffectFamilyDefinition {
  return {
    id: "test-template",
    version: 1,
    category: "decorative-animation",
    name: "测试模板",
    description: "测试动效",
    purposeTags: ["测试"],
    visualDirections: ["简洁信息"],
    defaultDurationInFrames: 10,
    parameters: [],
    startingStyles: [{ id: "default", name: "默认", visualDirection: "简洁信息", defaultParams: {} }],
    aspectRatioDefaults: {},
    render,
  };
}

describe("特效模板卡片", () => {
  it("只保留添加操作，同时保留卡片拖拽能力", () => {
    const onAddTemplate = vi.fn();

    render(<TemplateCard onAddTemplate={onAddTemplate} template={createTemplate(() => <span />)} />);

    expect(screen.queryByRole("button", { name: /预览|停止/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "添加测试模板" }));
    expect(onAddTemplate).toHaveBeenCalledWith("test-template", "default");
    expect(screen.getByRole("article").getAttribute("draggable")).toBe("true");
  });

  it("模板缩略图默认展示代表帧，鼠标悬浮后才从首帧播放动效", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    const initialCallCount = renderTemplate.mock.calls.length;

    act(() => vi.advanceTimersByTime(50));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 5 }));
    expect(renderTemplate.mock.calls.length).toBe(initialCallCount);

    fireEvent.mouseEnter(screen.getByRole("article"));
    act(() => vi.advanceTimersByTime(50));

    expect(renderTemplate.mock.calls.length).toBeGreaterThan(initialCallCount);
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 1 }));
  });

  it("鼠标移出后停止预览并回到代表帧", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(100));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 2 }));

    fireEvent.mouseLeave(card);
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 5 }));

    act(() => vi.advanceTimersByTime(100));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 5 }));
  });

  it("系统要求减少动态效果时保留代表帧而不启动短动效", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    })));

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    fireEvent.mouseEnter(screen.getByRole("article"));
    act(() => vi.advanceTimersByTime(150));

    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 5 }));
  });

  it("不再显示悬停预览提示", () => {
    render(<TemplateCard template={createTemplate(() => <span />)} />);

    expect(screen.queryByText("悬停预览")).toBeNull();
    expect(screen.queryByText("代表帧")).toBeNull();
  });

  it("拖放过程中提供抓取状态，结束后恢复正常卡片状态", () => {
    const dataTransfer = { effectAllowed: "", setData: vi.fn() } as unknown as DataTransfer;
    render(<TemplateCard template={createTemplate(() => <span />)} />);
    const card = screen.getByRole("article");

    fireEvent.dragStart(card, { dataTransfer });
    expect(card.classList.contains("template-card--dragging")).toBe(true);
    fireEvent.dragEnd(card);
    expect(card.classList.contains("template-card--dragging")).toBe(false);
  });

  it("拖放开始不记录最近使用，只有目标确认成功后才记录", () => {
    const onTemplateUsed = vi.fn();
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "",
      setData: vi.fn(),
    } as unknown as DataTransfer;
    const template = createTemplate(() => <span />);
    render(<TemplateCard onTemplateUsed={onTemplateUsed} template={template} />);
    const card = screen.getByRole("article");

    fireEvent.dragStart(card, { dataTransfer });
    expect(onTemplateUsed).not.toHaveBeenCalled();

    fireEvent.dragEnd(card, { dataTransfer });
    expect(onTemplateUsed).not.toHaveBeenCalled();

    dataTransfer.dropEffect = "copy";
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragEnd(card, { dataTransfer });
    expect(onTemplateUsed).toHaveBeenCalledWith({
      familyId: "test-template",
      startingStyleId: "default",
      version: 1,
    });
  });

  it("只有进入可见区域的卡片才启动预览，离屏后停止更新", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(({ frame }: { frame: number }) => <span>{frame}</span>);
    let onIntersection: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    class FakeIntersectionObserver {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        onIntersection = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    const initialCallCount = renderTemplate.mock.calls.length;

    act(() => onIntersection?.([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(50));
    expect(renderTemplate.mock.calls.length).toBeGreaterThan(initialCallCount);

    const callCountWhileVisible = renderTemplate.mock.calls.length;
    act(() => onIntersection?.([{ isIntersecting: false }]));
    const callCountAfterLeavingViewport = renderTemplate.mock.calls.length;
    act(() => vi.advanceTimersByTime(100));
    expect(callCountAfterLeavingViewport).toBeGreaterThanOrEqual(callCountWhileVisible);
    expect(renderTemplate.mock.calls.length).toBe(callCountAfterLeavingViewport);
  });

  it("当前选中的卡片即使离屏也保留短预览", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);

    render(<TemplateCard isSelected template={createTemplate(renderTemplate)} />);
    const initialCallCount = renderTemplate.mock.calls.length;

    act(() => vi.advanceTimersByTime(50));

    expect(renderTemplate.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
