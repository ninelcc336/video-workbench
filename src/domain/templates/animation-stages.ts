import type {
  AnimationPhaseValue,
  AnimationStageName,
  AnimationStageValue,
} from "./types";

/** 中文注释：动画阶段输入允许只声明需要的阶段，完整阶段值由归一化函数补齐。 */
export type AnimationStageInput = Partial<Record<AnimationStageName, Partial<AnimationPhaseValue>>>;

export type AnimationStageCompressionResult = {
  stages: AnimationStageInput;
  compressed: boolean;
};

export const ANIMATION_STAGE_ORDER: readonly AnimationStageName[] = ["enter", "sustain", "exit"];

/** 中文注释：统一把阶段配置收敛到有限非负帧和明确字符串，供校验器与渲染器共享。 */
export function normalizeAnimationStagePhase(
  phase: Partial<AnimationPhaseValue> | undefined,
): AnimationPhaseValue {
  return {
    durationInFrames: Number.isFinite(phase?.durationInFrames)
      ? Math.max(0, Math.round(phase?.durationInFrames ?? 0))
      : 0,
    delayInFrames: Number.isFinite(phase?.delayInFrames)
      ? Math.max(0, Math.round(phase?.delayInFrames ?? 0))
      : 0,
    direction: typeof phase?.direction === "string" ? phase.direction : "none",
    easing: typeof phase?.easing === "string" ? phase.easing : "linear",
    intensity: Number.isFinite(phase?.intensity)
      ? Math.max(0, phase?.intensity ?? 0)
      : 0,
    stagger: Number.isFinite(phase?.stagger)
      ? Math.max(0, Math.round(phase?.stagger ?? 0))
      : 0,
  };
}

/**
 * 中文注释：按固定阶段顺序等比例压缩超出片段的动画，保留非负帧并返回是否发生压缩。
 * 未超过时只复制已声明阶段，避免调用方修改项目快照中的原对象。
 */
export function compressAnimationStages(
  stages: AnimationStageInput | AnimationStageValue | undefined,
  durationInFrames: number | undefined,
): AnimationStageCompressionResult {
  const declaredStages: AnimationStageInput = {};
  for (const stage of ANIMATION_STAGE_ORDER) {
    const phase = stages?.[stage];
    if (phase !== undefined) {
      declaredStages[stage] = { ...phase };
    }
  }

  if (
    typeof durationInFrames !== "number" ||
    !Number.isInteger(durationInFrames) ||
    durationInFrames <= 0
  ) {
    return { stages: declaredStages, compressed: false };
  }

  const phases = ANIMATION_STAGE_ORDER
    .filter((stage) => declaredStages[stage] !== undefined)
    .map((stage) => ({ stage, phase: normalizeAnimationStagePhase(declaredStages[stage]) }));
  const requestedFrames = phases.reduce(
    (total, { phase }) => total + phase.durationInFrames + phase.delayInFrames,
    0,
  );

  if (requestedFrames <= durationInFrames) {
    return { stages: declaredStages, compressed: false };
  }

  const scale = durationInFrames / requestedFrames;
  let remainingFrames = durationInFrames;
  const compressedStages: AnimationStageInput = {};
  for (const { stage, phase } of phases) {
    const delayInFrames = Math.min(
      remainingFrames,
      Math.max(0, Math.round(phase.delayInFrames * scale)),
    );
    const duration = Math.min(
      Math.max(0, remainingFrames - delayInFrames),
      Math.max(0, Math.round(phase.durationInFrames * scale)),
    );
    remainingFrames -= delayInFrames + duration;
    compressedStages[stage] = {
      ...phase,
      delayInFrames,
      durationInFrames: duration,
    };
  }

  return { stages: compressedStages, compressed: true };
}
