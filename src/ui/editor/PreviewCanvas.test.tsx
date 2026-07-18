// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { getContainSize, getPreviewDeviceStyle, getPreviewOrientation, PreviewCanvas } from "./PreviewCanvas";

vi.mock("../preview/PreviewPlayer", () => ({
  // 中文注释：这里仅替换 Remotion 运行时，布局测试通过实际工作区 DOM 验证控件与画布的边界。
  PreviewPlayer: () => <div data-testid="remotion-preview" />,
  clampPreviewFrame: (frame: number, durationInFrames: number) => Math.max(0, Math.min(durationInFrames - 1, frame)),
}));

afterEach(cleanup);

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
});
