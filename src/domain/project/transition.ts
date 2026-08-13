import type { EditProject, EffectClip, VideoClip } from "./model";

export type ResolvedBoundaryTransition = {
  effectClipId: string;
  beforeVideoClip: VideoClip;
  afterVideoClip: VideoClip;
  fromFrame: number;
  durationInFrames: number;
  warnings: string[];
};

/** 中文注释：仅向编辑器暴露可展示的转场诊断，不把源素材读取或渲染细节带入 UI。 */
export function getBoundaryTransitionWarnings(
  project: EditProject,
  effectClip: EffectClip,
): string[] {
  return resolveBoundaryTransition(project, effectClip)?.warnings ?? [];
}

export type TransitionVideoFrames = {
  beforeSourceFrame: number;
  afterSourceFrame: number;
  beforeFrozen: boolean;
  afterFrozen: boolean;
};

export type BoundaryTransitionReconciliation = {
  project: EditProject;
  removedEffectClipIds: string[];
  notices: string[];
};

function getVideoClipById(project: EditProject, clipId: string): VideoClip | undefined {
  return project.videoClips.find((clip) => clip.id === clipId);
}

/**
 * 中文注释：解析交界点特效的当前时间范围，只接受仍然严格相邻的前后视频片段。
 * 边界特效保存的 fromFrame 只是兼容缓存，返回值始终从 afterVideoClip 的当前起点派生。
 */
export function resolveBoundaryTransition(
  project: EditProject,
  effectClip: EffectClip,
): ResolvedBoundaryTransition | null {
  if (effectClip.placement?.type !== "boundary") return null;

  const beforeVideoClip = getVideoClipById(project, effectClip.placement.beforeVideoClipId);
  const afterVideoClip = getVideoClipById(project, effectClip.placement.afterVideoClipId);
  if (!beforeVideoClip || !afterVideoClip || beforeVideoClip.id === afterVideoClip.id) {
    return null;
  }

  const boundaryFrame = beforeVideoClip.fromFrame + beforeVideoClip.durationInFrames;
  if (boundaryFrame !== afterVideoClip.fromFrame) return null;

  const lastTimelineSourceFrame = beforeVideoClip.sourceStartFrame + beforeVideoClip.durationInFrames - 1;
  const knownSourceDuration = beforeVideoClip.sourceDurationInFrames;
  const beforeAvailableEndFrame = knownSourceDuration === undefined
    ? lastTimelineSourceFrame
    : Math.max(beforeVideoClip.sourceStartFrame, knownSourceDuration - 1);
  const beforeTailFrames = Math.max(0, beforeAvailableEndFrame - lastTimelineSourceFrame);
  const warnings: string[] = [];
  // 中文注释：窗口包含 0 到 duration-1 的全部局部帧，只要尾帧不足整个窗口就必须提示冻结。
  if (beforeTailFrames < effectClip.durationInFrames) {
    warnings.push("前视频素材尾帧不足，转场期间将冻结最后一个有效画面");
  }

  return {
    effectClipId: effectClip.id,
    beforeVideoClip,
    afterVideoClip,
    fromFrame: afterVideoClip.fromFrame,
    durationInFrames: effectClip.durationInFrames,
    warnings,
  };
}

/**
 * 中文注释：按转场窗口内局部帧计算两个视频的源帧，只对前片段尾部做确定性钳制。
 * 该函数不读取文件或真实媒体时钟，渲染器可以在任意暂停、跳转帧直接求值。
 */
export function getTransitionVideoFrames(
  transition: ResolvedBoundaryTransition,
  localFrame: number,
): TransitionVideoFrames {
  const safeLocalFrame = Number.isFinite(localFrame)
    ? Math.max(0, Math.min(transition.durationInFrames - 1, Math.round(localFrame)))
    : 0;
  const beforeLastTimelineFrame = transition.beforeVideoClip.sourceStartFrame
    + transition.beforeVideoClip.durationInFrames - 1;
  const beforeLastAvailableFrame = transition.beforeVideoClip.sourceDurationInFrames === undefined
    ? beforeLastTimelineFrame
    : Math.max(
        transition.beforeVideoClip.sourceStartFrame,
        transition.beforeVideoClip.sourceDurationInFrames - 1,
      );
  const beforeSourceFrame = Math.min(
    beforeLastTimelineFrame + 1 + safeLocalFrame,
    beforeLastAvailableFrame,
  );
  // 中文注释：后片段必须按正常源时间播放；只有前片段的尾帧不足属于本转场的冻结回退。
  const afterSourceFrame = transition.afterVideoClip.sourceStartFrame + safeLocalFrame;

  return {
    beforeSourceFrame,
    afterSourceFrame,
    beforeFrozen: beforeSourceFrame < beforeLastTimelineFrame + 1 + safeLocalFrame,
    afterFrozen: false,
  };
}

/**
 * 中文注释：在一次视频编辑命令完成后刷新边界特效的派生起点，并移除已经失效的绑定。
 * 返回的 notices 由 EditorStore 传给页面，确保移除动作与触发它的移动、删除或重排进入同一历史步。
 */
export function reconcileBoundaryTransitionPlacements(
  project: EditProject,
): BoundaryTransitionReconciliation {
  const removedEffectClipIds: string[] = [];
  const notices: string[] = [];
  const effectClips = project.effectClips.flatMap((effectClip) => {
    if (effectClip.placement?.type !== "boundary") return [{ ...effectClip }];

    const resolved = resolveBoundaryTransition(project, effectClip);
    if (!resolved) {
      removedEffectClipIds.push(effectClip.id);
      notices.push(`片段转场“${effectClip.id}”因绑定的视频片段不再相邻而已移除。`);
      return [];
    }

    return [{ ...effectClip, fromFrame: resolved.fromFrame }];
  });

  return {
    project: { ...project, effectClips },
    removedEffectClipIds,
    notices,
  };
}

/** 中文注释：所有时间轴和渲染调用方通过此函数读取有效范围，避免边界特效继续消费过期 fromFrame。 */
export function getEffectClipFrameRange(
  project: EditProject,
  effectClip: EffectClip,
): { fromFrame: number; durationInFrames: number } | null {
  if (effectClip.placement?.type !== "boundary") {
    return {
      fromFrame: effectClip.fromFrame,
      durationInFrames: effectClip.durationInFrames,
    };
  }

  const resolved = resolveBoundaryTransition(project, effectClip);
  return resolved
    ? { fromFrame: resolved.fromFrame, durationInFrames: resolved.durationInFrames }
    : null;
}
