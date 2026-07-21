// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemplateDefinition } from "../../domain/templates/types";
import { TemplateCard } from "./TemplateCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function createTemplate(render: TemplateDefinition["render"]): TemplateDefinition {
  return {
    id: "test-template",
    version: 1,
    category: "decorative-animation",
    name: "测试模板",
    description: "测试动效",
    defaultDurationInFrames: 10,
    parameters: [],
    render,
  };
}

describe("特效模板卡片", () => {
  it("只保留添加操作，同时保留卡片拖拽能力", () => {
    const onAddTemplate = vi.fn();

    render(<TemplateCard onAddTemplate={onAddTemplate} template={createTemplate(() => <span />)} />);

    expect(screen.queryByRole("button", { name: /预览|停止/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "添加测试模板" }));
    expect(onAddTemplate).toHaveBeenCalledWith("test-template");
    expect(screen.getByRole("article").getAttribute("draggable")).toBe("true");
  });

  it("模板缩略图默认停在首帧，鼠标悬浮后才推进动效帧", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    const initialCallCount = renderTemplate.mock.calls.length;

    act(() => vi.advanceTimersByTime(50));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 0 }));
    expect(renderTemplate.mock.calls.length).toBe(initialCallCount);

    fireEvent.mouseEnter(screen.getByRole("article"));
    act(() => vi.advanceTimersByTime(50));

    expect(renderTemplate.mock.calls.length).toBeGreaterThan(initialCallCount);
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 1 }));
  });

  it("鼠标移出后停止预览并回到首帧", () => {
    vi.useFakeTimers();
    const renderTemplate = vi.fn(() => <span />);

    render(<TemplateCard template={createTemplate(renderTemplate)} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(100));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 2 }));

    fireEvent.mouseLeave(card);
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 0 }));

    act(() => vi.advanceTimersByTime(100));
    expect(renderTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ frame: 0 }));
  });
});
