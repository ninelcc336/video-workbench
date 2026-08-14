import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import {
  createEffectFamilyInstance,
  getEffectFamily,
} from "../../domain/templates/effect-family";
import { renderProject, type RenderResult } from "./render-adapter";

// 中文注释：冒烟项目使用当前注册表中的族声明生成参数，避免测试夹具和真实渲染器维护两套默认值。
import "../../domain/templates/registry";

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

/**
 * 中文注释：为信息叠加或装饰动画构造一段范围特效冒烟项目；片段时间固定为一秒，方便 ffprobe 验证总帧数。
 * 关键约束：参数必须由当前特效族实例工厂生成，不能把旧模板字段带进真实 MP4 导出链路。
 */
function createEffectLayerSmokeProject(
  mediaId: string,
  familyId: string,
  startingStyleId: string,
  effectClipId: string,
): EditProject {
  const project = createSmokeProject(mediaId);
  const family = getEffectFamily(familyId, 1);
  const instance = createEffectFamilyInstance(family, startingStyleId, "1:1");
  project.effectClips = [{
    id: effectClipId,
    templateId: family.id,
    templateVersion: family.version,
    effectFamilyId: family.id,
    startingStyleId: instance.startingStyleId,
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: 30,
    params: instance.params,
  }];
  return project;
}

/** 中文注释：信息叠加冒烟覆盖新版信息族，验证文字层能和真实视频一起完成 MP4 导出。 */
export function createInformationSmokeProject(mediaId: string): EditProject {
  return createEffectLayerSmokeProject(mediaId, "emphasis-card", "solid-card", "information-smoke-effect");
}

/** 中文注释：装饰动画冒烟覆盖确定性手绘族，验证 SVG 装饰层不会破坏真实视频和音频导出。 */
export function createDecorationSmokeProject(mediaId: string): EditProject {
  return createEffectLayerSmokeProject(mediaId, "hand-drawn-emphasis", "underline", "decoration-smoke-effect");
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

/** 中文注释：渲染信息叠加冒烟媒体，和编辑器导出共用同一个 Render Adapter。 */
export function renderInformationSmokeMedia(inputPath: string, outputPath: string): Promise<RenderResult> {
  const project = createInformationSmokeProject("information-smoke-media");
  return renderProject(project, outputPath, {
    cancelSignal: () => false,
    mediaSources: { "information-smoke-media": inputPath },
    timeoutInMilliseconds: 15_000,
  });
}

/** 中文注释：渲染装饰动画冒烟媒体，确保装饰特效和真实视频层在离线导出中同时可用。 */
export function renderDecorationSmokeMedia(inputPath: string, outputPath: string): Promise<RenderResult> {
  const project = createDecorationSmokeProject("decoration-smoke-media");
  return renderProject(project, outputPath, {
    cancelSignal: () => false,
    mediaSources: { "decoration-smoke-media": inputPath },
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
