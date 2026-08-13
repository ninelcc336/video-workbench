import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  EffectFamilyTransitionRenderProps,
  ParameterDefinition,
  TransitionVideoFrame,
} from "../../domain/templates/types";
import { normalizeParameterValues } from "../../domain/templates/parameter-schema";
import { resolveMaskClipPath } from "./primitives";

type TransitionDirection = "left" | "right" | "top" | "bottom";
type TransitionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
type TransitionMode = "push-pull" | "directional-wipe" | "split-wipe";

type DirectionalTransitionParams = {
  mode: TransitionMode;
  direction: TransitionDirection;
  easing: TransitionEasing;
  softness: number;
  splitCount: number;
  accentColor: string;
};

type TransitionMaskDirection = "left" | "right" | "up" | "down";

export type SplitSegmentGeometry = {
  index: number;
  start: number;
  end: number;
  delay: number;
  progress: number;
  travel: number;
  clipPath: string;
};

/** 中文注释：集中维护用户方向对应的位移和遮罩语义，避免不同渲染分支各自解释方向。 */
const directionGeometry: Record<TransitionDirection, {
  vector: { x: number; y: number };
  mask: TransitionMaskDirection;
}> = {
  left: { mask: "left", vector: { x: -1, y: 0 } },
  right: { mask: "right", vector: { x: 1, y: 0 } },
  top: { mask: "down", vector: { x: 0, y: -1 } },
  bottom: { mask: "up", vector: { x: 0, y: 1 } },
};

const transitionDefaults: DirectionalTransitionParams = {
  mode: "push-pull",
  direction: "left",
  easing: "ease-in-out",
  softness: 6,
  splitCount: 4,
  accentColor: "#38bdf8",
};

const styleDefaults: Record<TransitionMode, Partial<DirectionalTransitionParams>> = {
  "push-pull": {
    mode: "push-pull",
    direction: "left",
    softness: 8,
    accentColor: "#38bdf8",
  },
  "directional-wipe": {
    mode: "directional-wipe",
    direction: "right",
    softness: 10,
    accentColor: "#f59e0b",
  },
  "split-wipe": {
    mode: "split-wipe",
    direction: "top",
    softness: 5,
    splitCount: 4,
    accentColor: "#f43f5e",
  },
};

const directions: ReadonlyArray<{ value: TransitionDirection; label: string }> = [
  { value: "left", label: "从左侧进入" },
  { value: "right", label: "从右侧进入" },
  { value: "top", label: "从上方进入" },
  { value: "bottom", label: "从下方进入" },
];

const easings: ReadonlyArray<{ value: TransitionEasing; label: string }> = [
  { value: "linear", label: "线性" },
  { value: "ease-in", label: "渐入" },
  { value: "ease-out", label: "渐出" },
  { value: "ease-in-out", label: "渐入渐出" },
];

const transitionParameters: ReadonlyArray<ParameterDefinition> = [
  {
    key: "mode",
    label: "过渡方式",
    type: "select",
    defaultValue: transitionDefaults.mode,
    options: [
      { value: "push-pull", label: "推拉" },
      { value: "directional-wipe", label: "方向擦除" },
      { value: "split-wipe", label: "分割擦除" },
    ],
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
    description: "选择前后画面的连接方式；起始样式会提供对应默认值。",
  },
  {
    key: "direction",
    label: "方向",
    type: "select",
    defaultValue: transitionDefaults.direction,
    options: directions,
    group: "animation",
    level: "basic",
    styleSwitch: "replace",
    description: "后视频画面进入的方向。",
  },
  {
    key: "easing",
    label: "缓动",
    type: "select",
    defaultValue: transitionDefaults.easing,
    options: easings,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
    description: "控制转场进度的速度变化。",
  },
  {
    key: "softness",
    label: "边界柔化",
    type: "number",
    defaultValue: transitionDefaults.softness,
    min: 0,
    max: 24,
    step: 1,
    group: "appearance",
    level: "advanced",
    styleSwitch: "replace",
    description: "控制转场边界的强调光晕和柔化范围。",
  },
  {
    key: "splitCount",
    label: "分割数量",
    type: "number",
    defaultValue: transitionDefaults.splitCount,
    min: 2,
    max: 8,
    step: 1,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
    description: "分割擦除使用的条带数量。",
  },
  {
    key: "accentColor",
    label: "强调色",
    type: "color",
    defaultValue: transitionDefaults.accentColor,
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
    description: "转场边界的强调色。",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 中文注释：渲染器复用特效基座的同一份 schema，避免第二套校验规则收窄颜色或数值语义。 */
function readTransitionParams(params: Record<string, unknown>): DirectionalTransitionParams {
  return normalizeParameterValues(transitionParameters, params) as DirectionalTransitionParams;
}

/** 中文注释：缓动在族内按局部帧直接计算，参数变化不会被组合层的固定缓动覆盖。 */
function resolveEasedProgress(
  frame: number,
  durationInFrames: number,
  easing: TransitionEasing,
): number {
  const raw = durationInFrames <= 1
    ? 1
    : clamp(frame / (durationInFrames - 1), 0, 1);

  return easeProgress(raw, easing);
}

/** 中文注释：对组合器提供的线性进度应用声明缓动，保持族渲染可以直接消费任意局部帧。 */
function easeProgress(rawProgress: number, easing: TransitionEasing): number {
  const raw = clamp(rawProgress, 0, 1);

  switch (easing) {
    case "ease-in":
      return raw ** 3;
    case "ease-out":
      return 1 - (1 - raw) ** 3;
    case "ease-in-out":
      return raw < 0.5
        ? 4 * raw ** 3
        : 1 - (-2 * raw + 2) ** 3 / 2;
    case "linear":
    default:
      return raw;
  }
}

/** 中文注释：方向向量统一约定为“后画面从该方向进入”，推拉样式据此让前画面向反方向退出。 */
function getDirectionVector(direction: TransitionDirection): { x: number; y: number } {
  return directionGeometry[direction].vector;
}

/** 中文注释：基础遮罩原语使用 up/down 命名，族声明对用户保持 top/bottom 语义。 */
function getMaskDirection(direction: TransitionDirection): TransitionMaskDirection {
  return directionGeometry[direction].mask;
}

/** 中文注释：分割擦除把每条带的局部进度转换为全画布裁切范围，避免嵌套百分比遮罩互相抵消。 */
function getSplitSegmentClipPath(
  start: number,
  end: number,
  progress: number,
  direction: "left" | "right" | "up" | "down",
): string {
  const segmentSize = end - start;
  const visibleStart = end - segmentSize * progress;
  const visibleEnd = start + segmentSize * progress;

  switch (direction) {
    case "right":
      return `inset(0 ${100 - end}% 0 ${visibleStart}%)`;
    case "up":
      return `inset(${visibleStart}% 0 ${100 - end}% 0)`;
    case "down":
      return `inset(${start}% 0 ${100 - visibleEnd}% 0)`;
    case "left":
    default:
      return `inset(0 ${100 - visibleEnd}% 0 ${start}%)`;
  }
}

/**
 * 中文注释：计算分割擦除的条带边界、交错延迟和位移，渲染层与契约测试共同消费这份几何结果。
 * 关键约束：条带数量必须影响每条带的边界和时序；非法数量会回退为至少一条，避免生成空渲染。
 */
export function getSplitSegmentGeometry(
  segmentCount: number,
  progress: number,
  direction: TransitionMaskDirection,
): SplitSegmentGeometry[] {
  const safeSegmentCount = Number.isFinite(segmentCount)
    ? Math.max(1, Math.round(segmentCount))
    : 1;
  const safeProgress = clamp(progress, 0, 1);
  const maxSegmentStagger = 0.28;

  return Array.from({ length: safeSegmentCount }, (_, index) => {
    const start = (index / safeSegmentCount) * 100;
    const end = ((index + 1) / safeSegmentCount) * 100;
    const delay = safeSegmentCount <= 1
      ? 0
      : (index / (safeSegmentCount - 1)) * maxSegmentStagger;
    const segmentProgress = clamp(
      (safeProgress - delay) / (1 - maxSegmentStagger),
      0,
      1,
    );

    return {
      clipPath: getSplitSegmentClipPath(start, end, segmentProgress, direction),
      delay,
      end,
      index,
      progress: segmentProgress,
      start,
      travel: (1 - segmentProgress) * 100,
    };
  });
}

/** 中文注释：强调色边界是三种样式共享的可见节拍，同时把边界柔化限制在有限像素范围内。 */
function getAccentEdgeStyle(
  direction: TransitionDirection,
  progress: number,
  softness: number,
  accentColor: string,
): React.CSSProperties {
  const thickness = Math.max(1, softness / 2);
  const edge = {
    backgroundColor: accentColor,
    boxShadow: `0 0 ${Math.max(0, softness)}px ${accentColor}`,
    filter: softness > 0 ? `blur(${Math.min(8, softness / 4)}px)` : undefined,
    pointerEvents: "none" as const,
    position: "absolute" as const,
    zIndex: 3,
  };
  const percentage = `${clamp(progress, 0, 1) * 100}%`;

  switch (direction) {
    case "right":
      return { ...edge, bottom: 0, height: "100%", right: `calc(${percentage} - ${thickness / 2}px)`, width: thickness };
    case "top":
      return { ...edge, height: thickness, left: 0, top: `calc(${percentage} - ${thickness / 2}px)`, width: "100%" };
    case "bottom":
      return { ...edge, bottom: `calc(${percentage} - ${thickness / 2}px)`, height: thickness, left: 0, width: "100%" };
    case "left":
    default:
      return { ...edge, bottom: 0, height: "100%", left: `calc(${percentage} - ${thickness / 2}px)`, width: thickness };
  }
}

/** 中文注释：每个双画面层都使用绝对填充，避免视频节点的尺寸变化影响画布和时间轴布局。 */
function createVideoLayer(
  frame: React.ReactNode,
  layer: "before" | "after",
  style: React.CSSProperties,
): React.ReactElement {
  return (
    <div data-transition-layer={layer} style={{ inset: 0, position: "absolute", ...style }}>
      {frame}
    </div>
  );
}

type TransitionLayerInput = {
  styleId: string;
  values: DirectionalTransitionParams;
  progress: number;
  before: TransitionVideoFrame;
  after: TransitionVideoFrame;
};

/** 中文注释：真实转场和卡片缩略图共享这一个视觉分支，避免预览展示和 MP4 渲染各自维护样式逻辑。 */
function renderTransitionLayers(input: TransitionLayerInput): React.ReactElement {
  const { styleId, values, progress, before, after } = input;
  const rootStyle: React.CSSProperties = {
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
  };

  if (values.mode === "push-pull") {
    const vector = getDirectionVector(values.direction);
    return (
      <div
        data-transition-style={styleId}
        data-transition-progress={progress}
        style={rootStyle}
      >
        {createVideoLayer(before.node, "before", {
          transform: `translate(${-vector.x * progress * 100}%, ${-vector.y * progress * 100}%)`,
        })}
        {createVideoLayer(after.node, "after", {
          transform: `translate(${vector.x * (1 - progress) * 100}%, ${vector.y * (1 - progress) * 100}%)`,
        })}
        <div
          aria-hidden="true"
          data-transition-accent="true"
          style={getAccentEdgeStyle(values.direction, progress, values.softness, values.accentColor)}
        />
      </div>
    );
  }

  if (values.mode === "directional-wipe") {
    return (
      <div
        data-transition-style={styleId}
        data-transition-progress={progress}
        style={rootStyle}
      >
        {createVideoLayer(before.node, "before", {})}
        {createVideoLayer(after.node, "after", {
          clipPath: resolveMaskClipPath(progress, getMaskDirection(values.direction)),
          filter: values.softness > 0 ? `blur(${Math.min(8, values.softness / 4)}px)` : undefined,
        })}
        <div
          aria-hidden="true"
          data-transition-accent="true"
          style={getAccentEdgeStyle(values.direction, progress, values.softness, values.accentColor)}
        />
      </div>
    );
  }

  const segmentCount = values.splitCount;
  const maskDirection = getMaskDirection(values.direction);
  const directionVector = getDirectionVector(values.direction);
  const segments = getSplitSegmentGeometry(segmentCount, progress, maskDirection);
  return (
    <div
      data-transition-style={styleId}
      data-transition-progress={progress}
      style={rootStyle}
    >
      {createVideoLayer(before.node, "before", {})}
      {segments.map(({ clipPath, index, travel }) => {
        return (
          <div
            data-transition-segment={index}
            key={index}
            style={{ clipPath, inset: 0, position: "absolute" }}
          >
            {createVideoLayer(after.node, "after", {
              transform: `translate(${directionVector.x * travel}%, ${directionVector.y * travel}%)`,
              filter: values.softness > 0 ? `blur(${Math.min(8, values.softness / 4)}px)` : undefined,
            })}
          </div>
        );
      })}
      <div
        aria-hidden="true"
        data-transition-accent="true"
        style={getAccentEdgeStyle(values.direction, progress, values.softness, values.accentColor)}
      />
    </div>
  );
}

/** 中文注释：模板卡片没有相邻视频画面，使用稳定的双色占位层展示同一方向和遮罩行为。 */
function renderTransitionPreview(props: EffectFamilyRenderProps): React.ReactElement {
  const values = readTransitionParams(props.params);
  const progress = resolveEasedProgress(props.frame, props.durationInFrames, values.easing);
  const before = (
    <div
      data-video-frame="before"
      style={{ background: "#172033", height: "100%", width: "100%" }}
    />
  );
  const after = (
    <div
      data-video-frame="after"
      style={{ background: values.accentColor, height: "100%", width: "100%" }}
    />
  );

  return (
    <div
      data-canvas-size={`${props.width}x${props.height}`}
      data-template-id="directional-transition"
      style={{ inset: 0, overflow: "hidden", position: "absolute" }}
    >
      {renderTransitionLayers({
        after: { clipId: "preview-after", frozen: false, node: after, sourceFrame: 0 },
        before: { clipId: "preview-before", frozen: false, node: before, sourceFrame: 0 },
        progress,
        styleId: props.startingStyleId,
        values,
      })}
    </div>
  );
}

/** 中文注释：真实双画面渲染只读取基座已经定位的前后节点，不读取媒体路径，也不处理音频。 */
function renderDirectionalTransition(
  props: EffectFamilyTransitionRenderProps,
): React.ReactElement {
  const values = readTransitionParams(props.params);
  const progress = easeProgress(props.progress, values.easing);
  return (
    <div
      data-canvas-size={`${props.canvas.width}x${props.canvas.height}`}
      data-template-id="directional-transition"
      data-transition-before-clip={props.before.clipId}
      data-transition-after-clip={props.after.clipId}
      style={{ inset: 0, overflow: "hidden", position: "absolute" }}
    >
      {renderTransitionLayers({
        after: props.after,
        before: props.before,
        progress,
        styleId: props.startingStyleId,
        values,
      })}
    </div>
  );
}

export const DirectionalTransition: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = (props) => renderTransitionPreview(props);

DirectionalTransition.definition = defineEffectFamily({
  id: "directional-transition",
  version: 1,
  category: "transition",
  name: "方向推拉与擦除",
  description: "同时合成前后视频画面的方向性推拉、擦除和分割过渡。",
  purposeTags: ["画面连接", "方向节拍", "片段转场"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 15,
  parameters: transitionParameters,
  startingStyles: [
    {
      id: "push-pull",
      name: "推拉",
      visualDirection: "简洁信息",
      defaultParams: styleDefaults["push-pull"],
    },
    {
      id: "directional-wipe",
      name: "方向擦除",
      visualDirection: "科技数据",
      defaultParams: styleDefaults["directional-wipe"],
    },
    {
      id: "split-wipe",
      name: "分割擦除",
      visualDirection: "活力社媒",
      defaultParams: styleDefaults["split-wipe"],
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <DirectionalTransition {...props} />,
  renderTransition: renderDirectionalTransition,
});
