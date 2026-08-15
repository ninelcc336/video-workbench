import type { AnimationStageValue, GradientValue } from "../../domain/templates/types";
import { evaluateAnimationStages } from "./animation";
import { withAlpha } from "./primitives";

/** 中文注释：信息族只引用这些审核过的素材槽位，参数中保存稳定 ID 而不是路径。 */
export const fontOptions = [
  { value: "font.system-sans", label: "系统无衬线" },
  { value: "font.system-mono", label: "系统等宽" },
];

export const iconOptions = [{ value: "icon.check", label: "勾选" }];

/** 中文注释：默认阶段提供可压缩的入场、持续和出场骨架，具体样式只覆盖方向与强度。 */
const defaultStages: AnimationStageValue = {
  enter: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "left",
    easing: "ease-out",
    intensity: 0.08,
    stagger: 0,
  },
  sustain: {
    durationInFrames: 96,
    delayInFrames: 0,
    direction: "none",
    easing: "linear",
    intensity: 0.006,
    stagger: 0,
  },
  exit: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "right",
    easing: "ease-in",
    intensity: 0.06,
    stagger: 0,
  },
};

export type SurfaceAppearance = "none" | "solid" | "glass" | "outline";
export type TextAlignment = "left" | "center" | "right";

/** 中文注释：统一解析背景、渐变、描边和阴影，保证新旧信息族的外观参数语义一致。 */
export function resolveSurfaceAppearance(input: {
  appearance: SurfaceAppearance;
  color: string;
  opacity: number;
  gradient: GradientValue;
  borderColor: string;
  borderWidth: number;
}): {
  background: string;
  gradient?: GradientValue;
  borderColor: string;
  borderWidth: number;
  shadow?: { blur: number; color: string; x: number; y: number };
} {
  if (input.appearance === "none") {
    return {
      background: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
    };
  }

  if (input.appearance === "outline") {
    return {
      background: withAlpha(input.color, input.opacity * 0.12),
      borderColor: input.borderColor,
      borderWidth: input.borderWidth,
    };
  }

  if (input.appearance === "glass") {
    return {
      background: withAlpha(input.color, input.opacity),
      gradient: {
        ...input.gradient,
        stops: input.gradient.stops.map((stop) => ({
          ...stop,
          color: withAlpha(stop.color, input.opacity),
        })),
      },
      borderColor: input.borderColor,
      borderWidth: input.borderWidth,
      shadow: { blur: 32, color: "#00000055", x: 0, y: 16 },
    };
  }

  return {
    background: withAlpha(input.color, input.opacity),
    borderColor: input.borderColor,
    borderWidth: input.borderWidth,
    shadow: { blur: 26, color: "#00000044", x: 0, y: 14 },
  };
}

/** 中文注释：把三段式动画求值为透明度和位移，结果只依赖局部帧以保证预览/导出一致。 */
export function resolveMotion(
  stages: AnimationStageValue,
  frame: number,
  durationInFrames: number,
  width: number,
  height: number,
  itemIndex = 0,
): { opacity: number; transform: string } {
  const evaluation = evaluateAnimationStages({
    frame,
    durationInFrames,
    stages,
    itemIndex,
  });
  return {
    opacity: evaluation.visibility,
    transform: `translate(${evaluation.offset.x * width}px, ${evaluation.offset.y * height}px)`,
  };
}

/** 中文注释：样式只声明阶段差异，不复制动画求值逻辑；未覆盖字段沿用统一默认骨架。 */
export function createStages(input: {
  enterDirection: string;
  exitDirection: string;
  enterIntensity?: number;
  exitIntensity?: number;
  stagger?: number;
  sustainDirection?: string;
  sustainEasing?: string;
  sustainIntensity?: number;
}): AnimationStageValue {
  return {
    enter: {
      durationInFrames: defaultStages.enter?.durationInFrames ?? 18,
      delayInFrames: defaultStages.enter?.delayInFrames ?? 0,
      easing: defaultStages.enter?.easing ?? "ease-out",
      direction: input.enterDirection,
      intensity: input.enterIntensity ?? defaultStages.enter?.intensity ?? 0.08,
      stagger: input.stagger ?? 0,
    },
    sustain: {
      durationInFrames: defaultStages.sustain?.durationInFrames ?? 96,
      delayInFrames: defaultStages.sustain?.delayInFrames ?? 0,
      easing: input.sustainEasing ?? defaultStages.sustain?.easing ?? "linear",
      direction: input.sustainDirection ?? "none",
      intensity: input.sustainIntensity ?? defaultStages.sustain?.intensity ?? 0.006,
      stagger: defaultStages.sustain?.stagger ?? 0,
    },
    exit: {
      durationInFrames: defaultStages.exit?.durationInFrames ?? 18,
      delayInFrames: defaultStages.exit?.delayInFrames ?? 0,
      easing: defaultStages.exit?.easing ?? "ease-in",
      direction: input.exitDirection,
      intensity: input.exitIntensity ?? defaultStages.exit?.intensity ?? 0.06,
      stagger: input.stagger ?? 0,
    },
  };
}

/** 中文注释：给信息卡内文字预留稳定空间，长文本由响应式文字原语缩小而不是撑破卡片。 */
export function getContentBox(input: {
  width: number;
  height: number;
  spacing: { top: number; right: number; bottom: number; left: number };
}): { width: number; height: number } {
  return {
    width: Math.max(1, input.width - input.spacing.left - input.spacing.right),
    height: Math.max(1, input.height - input.spacing.top - input.spacing.bottom),
  };
}
