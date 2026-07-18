// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { getContainSize, getPreviewDeviceStyle, getPreviewOrientation } from "./PreviewCanvas";

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
});
