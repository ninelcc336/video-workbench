import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import { renderProject, type RenderResult } from "./render-adapter";

/** 中文注释：冒烟项目保持最小尺寸和一秒时长，只验证真实媒体能走完本地导出链路。 */
export function createSmokeProject(mediaId: string, audioEnabled = true): EditProject {
  const project = createEmptyProject({ width: 64, height: 64, fps: 30 });
  project.videoClips = [
    {
      id: "smoke-video-clip",
      mediaId,
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled,
    },
  ];
  return project;
}

/** 中文注释：构造两段相邻素材的最小转场项目，用于验证双画面合成不会退化为单段覆盖层。 */
export function createTransitionSmokeProject(
  beforeMediaId: string,
  afterMediaId: string,
  startingStyleId: "push-pull" | "directional-wipe" | "split-wipe" = "push-pull",
): EditProject {
  const project = createEmptyProject({ width: 64, height: 64, fps: 30 });
  project.videoClips = [
    {
      id: "transition-before",
      mediaId: beforeMediaId,
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 15,
      sourceDurationInFrames: 30,
      audioEnabled: true,
    },
    {
      id: "transition-after",
      mediaId: afterMediaId,
      fromFrame: 15,
      sourceStartFrame: 0,
      durationInFrames: 15,
      sourceDurationInFrames: 30,
      audioEnabled: true,
    },
  ];
  project.effectClips = [{
    id: "transition-smoke-effect",
    templateId: "directional-transition",
    templateVersion: 1,
    effectFamilyId: "directional-transition",
    startingStyleId,
    placement: {
      type: "boundary",
      beforeVideoClipId: "transition-before",
      afterVideoClipId: "transition-after",
    },
    trackId: "effects-1",
    fromFrame: 15,
    durationInFrames: 8,
    params: {
      mode: startingStyleId,
      direction: "left",
      easing: "ease-in-out",
      softness: 8,
      splitCount: 4,
      accentColor: "#38bdf8",
    },
  }];
  return project;
}

/** 中文注释：命令行冒烟只传真实文件路径，适配器内部负责自动 bundle 和 Remotion 渲染。 */
export function renderSmokeMedia(inputPath: string, outputPath: string, audioEnabled = true): Promise<RenderResult> {
  const project = createSmokeProject("smoke-media", audioEnabled);
  return renderProject(project, outputPath, {
    cancelSignal: () => false,
    mediaSources: { "smoke-media": inputPath },
    // 中文注释：冒烟失败时在 15 秒内返回，避免 Chromium 环境异常让 CI 无限等待。
    timeoutInMilliseconds: 15_000,
  });
}

/** 中文注释：真实转场冒烟使用两个独立文件，确保 Remotion 同时打开前后素材并完成离线导出。 */
export function renderTransitionSmokeMedia(
  beforePath: string,
  afterPath: string,
  outputPath: string,
  startingStyleId: "push-pull" | "directional-wipe" | "split-wipe" = "push-pull",
): Promise<RenderResult> {
  const project = createTransitionSmokeProject("transition-before-media", "transition-after-media", startingStyleId);
  return renderProject(project, outputPath, {
    cancelSignal: () => false,
    mediaSources: {
      "transition-before-media": beforePath,
      "transition-after-media": afterPath,
    },
    timeoutInMilliseconds: 15_000,
  });
}
