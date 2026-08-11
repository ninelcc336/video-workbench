import { Easing, interpolate } from "remotion";
import type {
  AnimationPhaseValue,
  AnimationStageName,
  AnimationStageValue,
} from "../../domain/templates/types";
import {
  ANIMATION_STAGE_ORDER,
  compressAnimationStages,
  normalizeAnimationStagePhase,
  type AnimationStageInput,
} from "../../domain/templates/animation-stages";

export type AnimationPhaseEvaluation = {
  declared: boolean;
  stage: AnimationStageName;
  startFrame: number;
  endFrame: number;
  progress: number;
  active: boolean;
  direction: string;
  easing: string;
  intensity: number;
  stagger: number;
};

export type AnimationStageEvaluation = {
  frame: number;
  durationInFrames: number;
  activeStage?: AnimationStageName;
  enter: AnimationPhaseEvaluation;
  sustain: AnimationPhaseEvaluation;
  exit: AnimationPhaseEvaluation;
  visibility: number;
  offset: { x: number; y: number };
  warnings: string[];
};

/** 中文注释：使用有限的命名缓动集合，未知名称降级线性而不是引入不可预测的函数。 */
function applyAnimationEasing(progress: number, easing: string): number {
  const value = Math.min(1, Math.max(0, progress));

  switch (easing) {
    case "ease-in":
    case "cubic-in":
      return value ** 3;
    case "ease-out":
    case "cubic-out":
      return 1 - (1 - value) ** 3;
    case "ease-in-out":
    case "cubic-in-out":
      return value < 0.5
        ? 4 * value ** 3
        : 1 - (-2 * value + 2) ** 3 / 2;
    case "linear":
    default:
      return value;
  }
}

/** 中文注释：方向只表达二维平移方向，具体像素距离由渲染原语根据画布尺寸换算。 */
function getDirectionVector(direction: string): { x: number; y: number } {
  switch (direction) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "up":
    case "top":
      return { x: 0, y: -1 };
    case "down":
    case "bottom":
      return { x: 0, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}

/** 中文注释：在不保存运行时游标的前提下计算单个阶段，支持直接跳转到任意帧。 */
function evaluatePhase(
  frame: number,
  stage: AnimationStageName,
  phase: AnimationPhaseValue,
  declared: boolean,
  cursor: number,
  itemIndex: number,
): AnimationPhaseEvaluation {
  const startFrame = cursor + phase.delayInFrames + itemIndex * phase.stagger;
  const endFrame = startFrame + phase.durationInFrames;
  const rawProgress = phase.durationInFrames === 0
    ? (frame >= startFrame ? 1 : 0)
    : (frame - startFrame) / phase.durationInFrames;

  return {
    declared,
    stage,
    startFrame,
    endFrame,
    progress: applyAnimationEasing(rawProgress, phase.easing),
    active: declared && frame >= startFrame && frame < endFrame,
    direction: phase.direction,
    easing: phase.easing,
    intensity: phase.intensity,
    stagger: phase.stagger,
  };
}

/**
 * 中文注释：按 enter、sustain、exit 顺序求解阶段状态；结果只依赖输入帧和参数，适合过程预览与离线导出共用。
 */
export function evaluateAnimationStages(input: {
  frame: number;
  durationInFrames: number;
  stages?: AnimationStageInput | AnimationStageValue;
  itemIndex?: number;
}): AnimationStageEvaluation {
  const frame = Number.isFinite(input.frame) ? input.frame : 0;
  const durationInFrames = Number.isFinite(input.durationInFrames)
    ? Math.max(1, Math.round(input.durationInFrames))
    : 1;
  const itemIndex = Number.isFinite(input.itemIndex)
    ? Math.max(0, Math.trunc(input.itemIndex ?? 0))
    : 0;
  const compression = compressAnimationStages(input.stages, durationInFrames);
  const stages = compression.stages;
  const phases = {} as Record<AnimationStageName, AnimationPhaseEvaluation>;
  let cursor = 0;

  for (const stage of ANIMATION_STAGE_ORDER) {
    const phase = stages[stage];
    const normalized = normalizeAnimationStagePhase(phase);
    phases[stage] = evaluatePhase(
      frame,
      stage,
      normalized,
      phase !== undefined,
      cursor,
      itemIndex,
    );
    cursor += normalized.delayInFrames + normalized.durationInFrames;
  }

  const enter = phases.enter;
  const sustain = phases.sustain;
  const exit = phases.exit;
  const enterProgress = enter.declared ? enter.progress : 1;
  const exitProgress = exit.declared ? exit.progress : 0;
  const visibility = Math.min(1, Math.max(0, enterProgress * (1 - exitProgress)));

  let offset = { x: 0, y: 0 };
  if (enter.declared && frame < enter.endFrame) {
    const direction = getDirectionVector(enter.direction);
    const distance = enter.intensity * (1 - enter.progress);
    offset = { x: direction.x * distance, y: direction.y * distance };
  } else if (exit.declared && frame >= exit.startFrame) {
    const direction = getDirectionVector(exit.direction);
    const distance = exit.intensity * exit.progress;
    offset = { x: direction.x * distance, y: direction.y * distance };
  }

  return {
    frame,
    durationInFrames,
    activeStage: ANIMATION_STAGE_ORDER.find((stage) => phases[stage].active),
    enter,
    sustain,
    exit,
    visibility,
    offset,
    warnings: compression.compressed
      ? [`动画阶段总时长超过 ${durationInFrames} 帧，已按固定比例压缩`]
      : [],
  };
}

/** 中文注释：把动画时长收敛到有效帧数，避免异常参数破坏片段尾部的出场阶段。 */
function resolveAnimationDuration(
  durationInFrames: number,
  animationDuration: number,
): { durationInFrames: number; animationDuration: number } {
  const safeDurationInFrames = Number.isFinite(durationInFrames)
    ? Math.max(1, Math.round(durationInFrames))
    : 1;
  const requestedDuration = Number.isFinite(animationDuration)
    ? Math.max(1, Math.round(animationDuration))
    : safeDurationInFrames;

  return {
    durationInFrames: safeDurationInFrames,
    animationDuration: Math.min(safeDurationInFrames, requestedDuration),
  };
}

/** 中文注释：计算片段开始处的入场进度，并允许逐项动画使用帧偏移。 */
export function getEntranceProgress(
  frame: number,
  animationDuration: number,
  startFrame = 0,
): number {
  const safeDuration = Number.isFinite(animationDuration)
    ? Math.max(1, Math.round(animationDuration))
    : 1;
  const safeStartFrame = Number.isFinite(startFrame) ? Math.max(0, Math.round(startFrame)) : 0;

  return interpolate(frame, [safeStartFrame, safeStartFrame + safeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

/** 中文注释：计算片段尾部的出场进度，数值从 1 过渡到 0 表示逐渐退出。 */
export function getExitProgress(
  frame: number,
  durationInFrames: number,
  animationDuration: number,
): number {
  const safeValues = resolveAnimationDuration(durationInFrames, animationDuration);
  const exitStartFrame = safeValues.durationInFrames - safeValues.animationDuration;

  return interpolate(
    frame,
    [exitStartFrame, safeValues.durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      // 中文注释：反向播放入场的 out 缓动，确保最后一帧已经接近完全不可见。
      easing: Easing.out(Easing.cubic),
    },
  );
}

/** 中文注释：合并入场和出场进度，保证片段中间保持完整显示、两端平滑收放。 */
export function getVisibilityProgress(
  frame: number,
  durationInFrames: number,
  animationDuration: number,
): number {
  return Math.min(
    getEntranceProgress(frame, animationDuration),
    getExitProgress(frame, durationInFrames, animationDuration),
  );
}
