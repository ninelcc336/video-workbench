// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EffectClip } from "../../domain/project/model";
import { getEffectFamily } from "../../domain/templates/effect-family";
import "../../domain/templates/registry";
import { CanvasSelection } from "./CanvasSelection";

afterEach(cleanup);

function createEffectClip(): EffectClip {
  const family = getEffectFamily("card-overlay", 1);
  return {
    id: "effect-1",
    templateId: family.id,
    templateVersion: family.version,
    effectFamilyId: family.id,
    startingStyleId: "default",
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: family.defaultDurationInFrames,
    params: {
      text: "标题",
      color: "#111827",
      textColor: "#ffffff",
      position: { x: 0.5, y: 0.5 },
      size: { width: 0.4, height: 0.2 },
      enterDirection: "left",
      animationDuration: 18,
      radius: 24,
    },
  };
}

function setCanvasRect(element: HTMLElement): void {
  element.getBoundingClientRect = () => ({
    bottom: 1000,
    height: 1000,
    left: 0,
    right: 1000,
    top: 0,
    width: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("画布特效选区", () => {
  it.each([
    [10, true],
    [20, true],
    [30, false],
    [9, false],
  ] as const)("在%s时选区%s可见并允许画布交互", (_currentFrame, expectedActive) => {
    const clip = { ...createEffectClip(), fromFrame: 10, durationInFrames: 20 };
    const onPreviewParams = vi.fn();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={expectedActive}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.queryByRole("group", { name: "特效选区" });
    expect(Boolean(selection)).toBe(expectedActive);
    if (!expectedActive) {
      fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });
      fireEvent.mouseUp(window);
      expect(onPreviewParams).not.toHaveBeenCalled();
      expect(onChangeParams).not.toHaveBeenCalled();
    }
  });

  it("播放头回到生效区间时恢复选区并允许拖动", () => {
    const clip = { ...createEffectClip(), fromFrame: 10, durationInFrames: 20 };
    const onPreviewParams = vi.fn();
    const { rerender } = render(
      <CanvasSelection
        isSelectedClipActive={false}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    expect(screen.queryByRole("group", { name: "特效选区" })).toBeNull();

    rerender(
      <CanvasSelection
        isSelectedClipActive={true}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );
    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });

    expect(onPreviewParams).toHaveBeenCalledWith("effect-1", { position: { x: 0.8, y: 0.9 } });
  });

  it("拖动期间进入未生效区间时取消旧手势且不提交参数", () => {
    const clip = { ...createEffectClip(), fromFrame: 10, durationInFrames: 20 };
    const onPreviewEnd = vi.fn();
    const onChangeParams = vi.fn();
    const { rerender } = render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewEnd={onPreviewEnd}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    rerender(
      <CanvasSelection
        isSelectedClipActive={false}
        onChangeParams={onChangeParams}
        onPreviewEnd={onPreviewEnd}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );
    fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });
    fireEvent.mouseUp(window);

    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(onChangeParams).not.toHaveBeenCalled();
  });

  it("拖动过程中报告临时位置，松开后仍只提交最终参数", () => {
    const clip = createEffectClip();
    const onPreviewParams = vi.fn();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });

    expect(onPreviewParams).toHaveBeenLastCalledWith("effect-1", {
      position: { x: 0.8, y: 0.9 },
    });
    expect(onChangeParams).not.toHaveBeenCalled();

    fireEvent.mouseUp(window);
    expect(onChangeParams).toHaveBeenCalledWith("effect-1", {
      position: { x: 0.8, y: 0.9 },
    });
  });

  it("点击已选中特效但未超过拖拽阈值时不改变位置", () => {
    const clip = createEffectClip();
    const onPreviewParams = vi.fn();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 502, clientY: 502 });
    fireEvent.mouseUp(window);

    expect(onPreviewParams).not.toHaveBeenCalled();
    expect(onChangeParams).not.toHaveBeenCalled();
  });

  it("缩放过程中报告临时位置和尺寸", () => {
    const clip = createEffectClip();
    const onPreviewParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(screen.getByRole("button", { name: "调整特效右下角大小" }), { clientX: 700, clientY: 600 });
    fireEvent.mouseMove(window, { clientX: 800, clientY: 700 });

    expect(onPreviewParams).toHaveBeenLastCalledWith("effect-1", {
      position: { x: 0.55, y: 0.55 },
      size: { width: 0.5, height: 0.3 },
    });
  });

  it("拖回原位置时清理过程预览且不提交历史", () => {
    const clip = createEffectClip();
    const onPreviewEnd = vi.fn();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewEnd={onPreviewEnd}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 800, clientY: 800 });
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
    fireEvent.mouseUp(window);

    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(onChangeParams).not.toHaveBeenCalled();
  });

  it.each([
    ["左上", "nw", { clientX: 400, clientY: 400 }, { position: { x: 0.45, y: 0.45 }, size: { width: 0.5, height: 0.3 } }],
    ["右上", "ne", { clientX: 600, clientY: 400 }, { position: { x: 0.55, y: 0.45 }, size: { width: 0.5, height: 0.3 } }],
    ["左下", "sw", { clientX: 400, clientY: 600 }, { position: { x: 0.45, y: 0.55 }, size: { width: 0.5, height: 0.3 } }],
    ["右下", "se", { clientX: 600, clientY: 600 }, { position: { x: 0.55, y: 0.55 }, size: { width: 0.5, height: 0.3 } }],
  ] as const)("四个缩放角都能报告过程预览结果：%s", (label, handle, point, expected) => {
    const clip = createEffectClip();
    const onPreviewParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(screen.getByRole("button", { name: `调整特效${label}角大小` }), { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, point);

    expect(onPreviewParams).toHaveBeenLastCalledWith("effect-1", expected);
  });

  it("拖动开始后选中对象变化，仍把结果发给原特效", () => {
    const clip = createEffectClip();
    const replacement = { ...clip, id: "effect-2", params: { ...clip.params, position: { x: 0.2, y: 0.2 } } };
    const onPreviewParams = vi.fn();
    const onChangeParams = vi.fn();
    const { rerender } = render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    rerender(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
        project={createEmptyProject()}
        selectedClip={replacement}
      />,
    );
    fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });
    fireEvent.mouseUp(window);

    expect(onPreviewParams).toHaveBeenLastCalledWith("effect-1", { position: { x: 0.8, y: 0.9 } });
    expect(onChangeParams).toHaveBeenCalledWith("effect-1", { position: { x: 0.8, y: 0.9 } });
  });

  it("拖动选区时通过回调发出位置参数，不修改原片段", () => {
    const clip = createEffectClip();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });
    fireEvent.mouseUp(window);

    expect(onChangeParams).toHaveBeenCalledWith("effect-1", {
      position: { x: 0.8, y: 0.9 },
    });
    expect(clip.params.position).toEqual({ x: 0.5, y: 0.5 });
  });

  it("选区与调整手柄使用主题化样式类，动态样式只保留画布坐标", () => {
    render(
      <CanvasSelection
        isSelectedClipActive
        project={createEmptyProject()}
        selectedClip={createEffectClip()}
      />,
    );

    const selection = screen.getByLabelText("拖动特效位置");
    const handle = screen.getByRole("button", { name: "调整特效右下角大小" });
    expect(selection.classList.contains("canvas-selection")).toBe(true);
    expect(selection.style.border).toBe("");
    expect(handle.classList.contains("canvas-selection__handle--se")).toBe(true);
  });

  it("移动到画布外时限制位置，调整尺寸时不超过画布", () => {
    const clip = createEffectClip();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
        isSelectedClipActive={true}
        onChangeParams={onChangeParams}
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const selection = screen.getByRole("group", { name: "特效选区" });
    setCanvasRect(selection);
    fireEvent.mouseDown(selection, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: -100, clientY: -100 });
    fireEvent.mouseUp(window);

    expect(onChangeParams).toHaveBeenLastCalledWith("effect-1", {
      position: { x: 0.2, y: 0.1 },
    });

    const handle = screen.getByRole("button", { name: "调整特效右下角大小" });
    fireEvent.mouseDown(handle, { clientX: 700, clientY: 600 });
    fireEvent.mouseMove(window, { clientX: 1100, clientY: 1200 });
    fireEvent.mouseUp(window);

    const lastParams = onChangeParams.mock.lastCall?.[1] as Record<string, unknown>;
    expect(lastParams.size).toEqual({ width: 0.7, height: 0.6 });
    expect(lastParams.position).toEqual({ x: 0.65, y: 0.7 });
  });
});
// 中文注释：验证画布选区的边界限制和参数回调。
