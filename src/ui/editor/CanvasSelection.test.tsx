// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EffectClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import { CanvasSelection } from "./CanvasSelection";

afterEach(cleanup);

function createEffectClip(): EffectClip {
  const template = getTemplate("card-overlay", 1);
  return {
    id: "effect-1",
    templateId: template.id,
    templateVersion: template.version,
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: template.defaultDurationInFrames,
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
  it("拖动选区时通过回调发出位置参数，不修改原片段", () => {
    const clip = createEffectClip();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
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

  it("移动到画布外时限制位置，调整尺寸时不超过画布", () => {
    const clip = createEffectClip();
    const onChangeParams = vi.fn();

    render(
      <CanvasSelection
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
