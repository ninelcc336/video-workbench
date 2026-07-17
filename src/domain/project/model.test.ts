import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  framesToSeconds,
  secondsToFrames,
} from "./factories";

describe("编辑项目工厂与时间帧换算", () => {
  it("创建默认的竖屏编辑项目", () => {
    const project = createEmptyProject();

    expect(project).toMatchObject({
      schemaVersion: 1,
      settings: { width: 1080, height: 1920, fps: 30 },
      export: { format: "mp4", width: 1080, height: 1920, fps: 30 },
    });
    expect(project.videoClips).toEqual([]);
    expect(project.effectClips).toEqual([]);
  });

  it("允许用项目设置覆盖默认导出规格", () => {
    const project = createEmptyProject({ width: 1920, height: 1080, fps: 30 });

    expect(project.settings).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(project.export).toEqual({
      format: "mp4",
      width: 1920,
      height: 1080,
      fps: 30,
    });
  });

  it("把秒数转换成非负整数帧", () => {
    // 中文注释：秒数是交互层输入，持久化前统一转换为整数帧。
    expect(secondsToFrames(1.5, 30)).toBe(45);
    expect(secondsToFrames(0, 30)).toBe(0);
  });

  it("拒绝负数秒数、无效帧率和非法帧输入", () => {
    expect(() => secondsToFrames(-1, 30)).toThrow();
    expect(() => secondsToFrames(1, 0)).toThrow();
    expect(() => framesToSeconds(-1, 30)).toThrow();
    expect(() => framesToSeconds(1.5, 30)).toThrow();
  });

  it("把非负整数帧转换成秒数", () => {
    expect(framesToSeconds(45, 30)).toBe(1.5);
  });
});
