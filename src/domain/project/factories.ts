import type { EditProject, ProjectSettings } from "./model";

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 1080,
  height: 1920,
  fps: 30,
};

function assertValidFps(fps: number): void {
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new RangeError("帧率必须是正整数");
  }
}

function assertValidSeconds(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("秒数必须是非负有限数");
  }
}

/**
 * 中文注释：交互输入可以使用小数秒，但项目持久化前必须落成非负整数帧。
 * 使用四舍五入把秒数吸附到最近的帧，避免保存浮点时间。
 */
export function secondsToFrames(seconds: number, fps: number): number {
  assertValidSeconds(seconds);
  assertValidFps(fps);
  return Math.round(seconds * fps);
}

/** 中文注释：只有非负整数帧才能参与秒数换算，防止非法时间进入领域模型。 */
export function framesToSeconds(frames: number, fps: number): number {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError("帧数必须是非负整数");
  }
  assertValidFps(fps);
  return frames / fps;
}

/** 中文注释：创建不含素材和特效片段的最小编辑项目，默认导出为竖屏 MP4。 */
export function createEmptyProject(
  settings: Partial<ProjectSettings> = {},
): EditProject {
  const resolvedSettings: ProjectSettings = {
    ...DEFAULT_PROJECT_SETTINGS,
    ...settings,
  };

  return {
    schemaVersion: 1,
    settings: resolvedSettings,
    videoClips: [],
    effectClips: [],
    export: {
      format: "mp4",
      width: resolvedSettings.width,
      height: resolvedSettings.height,
      fps: resolvedSettings.fps,
    },
  };
}
