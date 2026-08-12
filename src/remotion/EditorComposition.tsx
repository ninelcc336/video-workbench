import React from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { EditProject, EffectClip } from "../domain/project/model";
import {
  getEffectClipFrameRange,
  getTransitionVideoFrames,
  resolveBoundaryTransition,
} from "../domain/project/transition";
// 中文注释：加载旧模板注册副作用，让历史 v1 声明也能通过统一特效族查找入口读取。
import "../domain/templates/registry";
import {
  createEffectRenderInput,
  createTemplateDefinitionAdapter,
  getEffectFamily,
  getAspectRatioForCanvas,
} from "../domain/templates/effect-family";
import type {
  EffectFamilyRenderProps,
  EffectFamilyTransitionRenderProps,
  EffectFamilyDefinition,
  TemplateDefinition,
  TransitionVideoFrame,
} from "../domain/templates/types";
import { assertMediaSource, type MediaSources } from "./media";

// 中文注释：预览和导出都通过这个组合消费同一份编辑项目快照。
export type EditorCompositionProps = {
  project: EditProject;
  mediaSources: MediaSources;
};

/** 中文注释：组合时长由视频轨道决定；范围特效可延长尾部，真实转场只能覆盖现有视频窗口。 */
export function getCompositionDurationInFrames(project: EditProject): number {
  const videoEnd = project.videoClips.reduce(
    (end, clip) => Math.max(end, clip.fromFrame + clip.durationInFrames),
    0,
  );
  // 中文注释：真实转场只覆盖后视频的交界窗口，不能因为自身时长超过后片段而延长项目总时长。
  const effectEnd = project.effectClips.reduce((end, clip) => {
    if (clip.placement?.type === "boundary") return end;
    const range = getEffectClipFrameRange(project, clip);
    return range ? Math.max(end, range.fromFrame + range.durationInFrames) : end;
  }, 0);

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

/** 中文注释：把一个精确源帧包在当前局部帧上，避免转场读取不存在的历史帧；冻结时只重复该单帧。 */
function createTransitionVideoFrameNode(
  frame: number,
  sourceFrame: number,
  src: string,
) {
  return (
    <Sequence durationInFrames={1} from={frame} layout="none">
      <OffthreadVideo
        muted
        src={src}
        startFrom={sourceFrame}
        trimAfter={1}
        style={{ height: "100%", objectFit: "contain", width: "100%" }}
      />
    </Sequence>
  );
}

/** 中文注释：未声明族级双画面实现时提供最小可用交叉淡化，确保边界放置不会退化为纯色覆盖。 */
function DefaultTransitionLayer({
  before,
  after,
  progress,
}: {
  before: TransitionVideoFrame;
  after: TransitionVideoFrame;
  progress: number;
}) {
  return (
    <AbsoluteFill>
      <div style={{ inset: 0, opacity: 1 - progress, position: "absolute" }}>{before.node}</div>
      <div style={{ inset: 0, opacity: progress, position: "absolute" }}>{after.node}</div>
    </AbsoluteFill>
  );
}

export type TransitionLayerRenderInput = {
  family: EffectFamilyDefinition;
  renderProps: EffectFamilyTransitionRenderProps;
};

/** 中文注释：生成真实转场的公共渲染输入，预览组合和固定帧/离线测试都从这里读取相同的双画面契约。 */
export function getTransitionLayerRenderProps(
  project: EditProject,
  clip: EffectClip,
  frame: number,
  mediaSources: MediaSources,
): TransitionLayerRenderInput | null {
  const resolved = resolveBoundaryTransition(project, clip);
  if (!resolved) return null;
  const beforeSource = assertMediaSource(resolved.beforeVideoClip.mediaId, mediaSources);
  const afterSource = assertMediaSource(resolved.afterVideoClip.mediaId, mediaSources);
  const durationInFrames = resolved.durationInFrames;
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
    durationInFrames,
    params: clip.params,
  });
  const localFrame = renderInput.renderProps.frame;
  const videoFrames = getTransitionVideoFrames(resolved, localFrame);
  const progress = interpolate(
    localFrame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    { easing: Easing.inOut(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const before: TransitionVideoFrame = {
    clipId: resolved.beforeVideoClip.id,
    sourceFrame: videoFrames.beforeSourceFrame,
    frozen: videoFrames.beforeFrozen,
    node: createTransitionVideoFrameNode(localFrame, videoFrames.beforeSourceFrame, beforeSource),
  };
  const after: TransitionVideoFrame = {
    clipId: resolved.afterVideoClip.id,
    sourceFrame: videoFrames.afterSourceFrame,
    frozen: videoFrames.afterFrozen,
    node: createTransitionVideoFrameNode(localFrame, videoFrames.afterSourceFrame, afterSource),
  };

  return {
    family,
    renderProps: {
      ...renderInput.renderProps,
      localFrame,
      progress,
      canvas: { width: project.settings.width, height: project.settings.height },
      before,
      after,
    },
  };
}

/** 中文注释：真实转场通过族级双画面渲染器混合前后画面；缺少专用实现时使用确定性交叉淡化兜底。 */
function TransitionLayer({
  clip,
  project,
  mediaSources,
}: {
  clip: EffectClip;
  project: EditProject;
  mediaSources: MediaSources;
}) {
  const renderInput = getTransitionLayerRenderProps(project, clip, useCurrentFrame(), mediaSources);
  if (!renderInput) return null;
  return renderInput.family.renderTransition
    ? renderInput.family.renderTransition(renderInput.renderProps)
    : <DefaultTransitionLayer {...renderInput.renderProps} />;
}

/** 中文注释：预览与导出共享同一视频轨道、范围特效层和真实双画面转场层。 */
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
        const range = getEffectClipFrameRange(project, clip);
        if (!range) return null;
        if (clip.placement?.type === "boundary") {
          return (
            <Sequence
              durationInFrames={range.durationInFrames}
              from={range.fromFrame}
              key={clip.id}
              style={{ pointerEvents: "none", zIndex: 2 }}
            >
              <AbsoluteFill>
                <TransitionLayer clip={clip} mediaSources={mediaSources} project={project} />
              </AbsoluteFill>
            </Sequence>
          );
        }
        return (
          <Sequence
            durationInFrames={range.durationInFrames}
            from={range.fromFrame}
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
