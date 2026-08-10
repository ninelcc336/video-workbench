import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { EditProject, EffectClip } from "../domain/project/model";
// 中文注释：加载旧模板注册副作用，让历史 v1 声明也能通过统一特效族查找入口读取。
import "../domain/templates/registry";
import {
  createEffectRenderInput,
  createTemplateDefinitionAdapter,
  getEffectFamily,
  getAspectRatioForCanvas,
} from "../domain/templates/effect-family";
import type { EffectFamilyRenderProps, TemplateDefinition } from "../domain/templates/types";
import { assertMediaSource, type MediaSources } from "./media";

// 中文注释：预览和导出都通过这个组合消费同一份编辑项目快照。
export type EditorCompositionProps = {
  project: EditProject;
  mediaSources: MediaSources;
};

export function getCompositionDurationInFrames(project: EditProject): number {
  const videoEnd = project.videoClips.reduce(
    (end, clip) => Math.max(end, clip.fromFrame + clip.durationInFrames),
    0,
  );
  const effectEnd = project.effectClips.reduce(
    (end, clip) => Math.max(end, clip.fromFrame + clip.durationInFrames),
    0,
  );

  return Math.max(1, videoEnd, effectEnd);
}

export function getCompositionMediaSources(
  project: EditProject,
  mediaSources: MediaSources,
): Array<{ clipId: string; mediaId: string; src: string; audioEnabled: boolean }> {
  return project.videoClips.map((clip) => ({
    clipId: clip.id,
    mediaId: clip.mediaId,
    src: assertMediaSource(clip.mediaId, mediaSources),
    audioEnabled: clip.audioEnabled,
  }));
}

export type EffectLayerRenderProps = {
  template: TemplateDefinition;
  renderProps: EffectFamilyRenderProps;
};

/** 中文注释：把编辑项目中的特效片段转换成模板渲染输入，统一注册表查找、局部帧和参数归一化。 */
export function getEffectLayerRenderProps(
  project: EditProject,
  clip: EffectClip,
  frame: number,
): EffectLayerRenderProps {
  const family = getEffectFamily(clip.effectFamilyId ?? clip.templateId, clip.templateVersion);
  const renderInput = createEffectRenderInput({
    familyId: family.id,
    version: clip.templateVersion,
    startingStyleId: clip.startingStyleId ?? "legacy-default",
    aspectRatio: getAspectRatioForCanvas(project.settings.width, project.settings.height),
    frame,
    fps: project.settings.fps,
    width: project.settings.width,
    height: project.settings.height,
    durationInFrames: clip.durationInFrames,
    params: clip.params,
  });

  return {
    template: createTemplateDefinitionAdapter(family, renderInput.renderProps.startingStyleId),
    renderProps: renderInput.renderProps,
  };
}

function TemplateLayer({ clip, project }: { clip: EffectClip; project: EditProject }) {
  const { template, renderProps } = getEffectLayerRenderProps(project, clip, useCurrentFrame());

  return template.render(renderProps);
}

export function EditorComposition({ project, mediaSources }: EditorCompositionProps) {
  const videoSources = getCompositionMediaSources(project, mediaSources);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {project.videoClips.map((clip) => {
        const source = videoSources.find((item) => item.clipId === clip.id);

        if (!source) {
          return null;
        }

        return (
          <Sequence
            durationInFrames={clip.durationInFrames}
            from={clip.fromFrame}
            key={clip.id}
          >
            <OffthreadVideo
              muted={!clip.audioEnabled}
              startFrom={clip.sourceStartFrame}
              src={source.src}
              // 中文注释：完整保留视频画面并保持比例，预览容器负责按可用空间等比放大。
              style={{ height: "100%", objectFit: "contain", width: "100%" }}
            />
          </Sequence>
        );
      })}
      {project.effectClips.map((clip) => {
        return (
          <Sequence
            durationInFrames={clip.durationInFrames}
            from={clip.fromFrame}
            key={clip.id}
            style={{ pointerEvents: "none", zIndex: 1 }}
          >
            <AbsoluteFill>
              <TemplateLayer clip={clip} project={project} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
