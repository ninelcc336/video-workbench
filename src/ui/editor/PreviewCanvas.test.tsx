// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EffectClip } from "../../domain/project/model";
import { createEffectFamilyInstance, getEffectFamily } from "../../domain/templates/effect-family";
import { getContainSize, getPreviewDeviceStyle, getPreviewOrientation, PreviewCanvas } from "./PreviewCanvas";

vi.mock("../preview/PreviewPlayer", () => ({
  // 中文注释：这里仅替换 Remotion 运行时，布局测试通过实际工作区 DOM 验证控件与画布的边界。
  PreviewPlayer: () => <div data-testid="remotion-preview" />,
  clampPreviewFrame: (frame: number, durationInFrames: number) => Math.max(0, Math.min(durationInFrames - 1, frame)),
}));

afterEach(cleanup);

/** 中文注释：构造带有明确生效区间的特效片段，复用真实 CanvasSelection 验证预览接缝；默认使用族首个起始样式。 */
function createEffectClip(
  templateId = "card-overlay",
  fromFrame = 10,
  durationInFrames = 20,
  id = "effect-1",
): EffectClip {
  const family = getEffectFamily(templateId, 1);
  const startingStyleId = family.startingStyles[0].id;
  const instance = createEffectFamilyInstance(family, startingStyleId, "16:9");
  return {
    id,
    templateId: family.id,
    templateVersion: family.version,
    effectFamilyId: family.id,
    startingStyleId,
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame,
    durationInFrames,
    params: instance.params,
  };
}

describe("预览画布尺寸", () => {
  it("在可用区域内按项目比例放大宽屏画布", () => {
    expect(getContainSize(800, 600, 1920, 1080)).toEqual({ width: 800, height: 450 });
  });

  it("在可用区域内按项目比例放大竖屏画布", () => {
    expect(getContainSize(800, 600, 1080, 1920)).toEqual({ width: 337, height: 600 });
  });

  it("预览外壳使用项目设置的宽高比而不是固定竖屏比例", () => {
    const project = createEmptyProject();
    project.settings = { width: 1920, height: 1080, fps: 30 };

    expect(getPreviewDeviceStyle(project).aspectRatio).toBe("1920 / 1080");
  });

  it("预览外壳保留非 16:9 横屏编辑项目的比例", () => {
    const project = createEmptyProject();
    project.settings = { width: 1920, height: 1440, fps: 30 };

    expect(getPreviewDeviceStyle(project).aspectRatio).toBe("1920 / 1440");
  });

  it("明确区分横屏、竖屏和方形项目", () => {
    expect(getPreviewOrientation({ width: 1920, height: 1080 })).toBe("横屏");
    expect(getPreviewOrientation({ width: 1080, height: 1920 })).toBe("竖屏");
    expect(getPreviewOrientation({ width: 1080, height: 1080 })).toBe("方形");
  });

  it("把控制栏放在画布之外，并保留横屏和竖屏的项目比例", () => {
    const horizontalProject = createEmptyProject();
    horizontalProject.settings = { width: 1920, height: 1080, fps: 30 };
    const { container, rerender } = render(<PreviewCanvas project={horizontalProject} />);

    const horizontalCanvas = container.querySelector(".preview-device__canvas") as HTMLDivElement;
    const controls = screen.getByRole("group", { name: "实时预览控制栏" });
    expect(horizontalCanvas.style.aspectRatio).toBe("1920 / 1080");
    expect(horizontalCanvas.contains(controls)).toBe(false);

    const verticalProject = createEmptyProject();
    verticalProject.settings = { width: 1080, height: 1920, fps: 30 };
    rerender(<PreviewCanvas project={verticalProject} />);

    const verticalCanvas = container.querySelector(".preview-device__canvas") as HTMLDivElement;
    expect(verticalCanvas.style.aspectRatio).toBe("1080 / 1920");
    expect(verticalCanvas.contains(screen.getByRole("group", { name: "实时预览控制栏" }))).toBe(false);
  });

  it.each([
    [10, true],
    [20, true],
    [29, true],
    [30, false],
    [9, false],
  ] as const)("在%s时选区%s可见", (currentFrame, expectedActive) => {
    const project = createEmptyProject();
    const clip = createEffectClip();

    render(<PreviewCanvas currentFrame={currentFrame} project={project} selectedClip={clip} />);

    expect(Boolean(screen.queryByRole("group", { name: "特效选区" }))).toBe(expectedActive);
  });

  it.each([
    "section-title-overlay",
    "checklist-steps",
    "comment-panel-overlay",
    "tag-pills-overlay",
  ])("新增信息叠加模板 %s 在实时预览中提供可拖拽选区", (templateId) => {
    const project = createEmptyProject();
    const clip = createEffectClip(templateId);

    render(<PreviewCanvas currentFrame={10} project={project} selectedClip={clip} />);

    // 中文注释：没有选区就没有位置和尺寸手柄，用户无法在实时预览中拖拽该特效。
    expect(screen.getByRole("group", { name: "特效选区" })).toBeTruthy();
  });
});

describe("实时预览直接选择特效", () => {
  it("点击当前生效特效的边界框即可选中特效片段", () => {
    const project = createEmptyProject();
    const clip = createEffectClip("section-title-overlay");
    project.effectClips = [clip];
    const onSelectClip = vi.fn();

    render(
      <PreviewCanvas
        currentFrame={10}
        onSelectClip={onSelectClip}
        project={project}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "选择特效：章节标题卡" }));

    expect(onSelectClip).toHaveBeenCalledWith("effect-1");
  });

  it("点击预览空白区域可以取消当前特效选择", () => {
    const project = createEmptyProject();
    const clip = createEffectClip("section-title-overlay");
    project.effectClips = [clip];
    const onSelectClip = vi.fn();

    render(
      <PreviewCanvas
        currentFrame={10}
        onSelectClip={onSelectClip}
        project={project}
        selectedClip={clip}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText("取消特效选择"));

    expect(onSelectClip).toHaveBeenCalledWith(null);
  });

  it("播放头不在生效区间时不提供预览特效选择目标", () => {
    const project = createEmptyProject();
    project.effectClips = [createEffectClip("section-title-overlay")];

    render(<PreviewCanvas currentFrame={9} project={project} />);

    expect(screen.queryByRole("button", { name: "选择特效：章节标题卡" })).toBeNull();
  });

  it("重叠特效按预览层级优先命中最上层特效", () => {
    const project = createEmptyProject();
    project.effectClips = [
      createEffectClip("section-title-overlay", 10, 20, "effect-1"),
      createEffectClip("section-title-overlay", 10, 20, "effect-2"),
    ];
    const onSelectClip = vi.fn();

    render(
      <PreviewCanvas
        currentFrame={10}
        onSelectClip={onSelectClip}
        project={project}
      />,
    );

    const targets = screen.getAllByRole("button", { name: "选择特效：章节标题卡" });
    expect(Number(targets[1].getAttribute("style")?.match(/z-index: (\d+)/)?.[1])).toBeGreaterThan(
      Number(targets[0].getAttribute("style")?.match(/z-index: (\d+)/)?.[1]),
    );
    fireEvent.mouseDown(targets[1]);

    expect(onSelectClip).toHaveBeenCalledWith("effect-2");
  });

  it("从未选中特效按下并移动超过阈值后进行位置过程预览并一次提交", () => {
    const project = createEmptyProject();
    const clip = createEffectClip("section-title-overlay");
    project.effectClips = [clip];
    const onSelectClip = vi.fn();
    const onPreviewParams = vi.fn();
    const onPreviewEnd = vi.fn();
    const onChangeParams = vi.fn();

    render(
      <PreviewCanvas
        currentFrame={10}
        onChangeParams={onChangeParams}
        onPreviewEnd={onPreviewEnd}
        onPreviewParams={onPreviewParams}
        onSelectClip={onSelectClip}
        project={project}
      />,
    );

    const canvas = screen.getByLabelText("取消特效选择");
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ bottom: 1000, height: 1000, left: 0, right: 1000, top: 0, width: 1000 }),
    });
    const target = screen.getByRole("button", { name: "选择特效：章节标题卡" });
    fireEvent.mouseDown(target, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 101, clientY: 101 });
    expect(onPreviewParams).not.toHaveBeenCalled();

    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    expect(onPreviewParams).toHaveBeenLastCalledWith("effect-1", {
      position: { x: 0.41, y: 0.33 },
    });
    fireEvent.mouseUp(window);

    expect(onChangeParams).toHaveBeenCalledWith("effect-1", {
      position: { x: 0.41, y: 0.33 },
    });
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);
  });

  it("直接拖动期间播放头离开生效区间时取消手势且不提交位置", () => {
    const project = createEmptyProject();
    const clip = createEffectClip("section-title-overlay");
    project.effectClips = [clip];
    const onPreviewEnd = vi.fn();
    const onChangeParams = vi.fn();
    const { rerender } = render(
      <PreviewCanvas
        currentFrame={10}
        onChangeParams={onChangeParams}
        onPreviewEnd={onPreviewEnd}
        project={project}
      />,
    );

    const canvas = screen.getByLabelText("取消特效选择");
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ bottom: 1000, height: 1000, left: 0, right: 1000, top: 0, width: 1000 }),
    });
    fireEvent.mouseDown(screen.getByRole("button", { name: "选择特效：章节标题卡" }), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    rerender(<PreviewCanvas currentFrame={30} onChangeParams={onChangeParams} onPreviewEnd={onPreviewEnd} project={project} />);
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(window);

    expect(onPreviewEnd).toHaveBeenCalledOnce();
    expect(onChangeParams).not.toHaveBeenCalled();
  });
});
