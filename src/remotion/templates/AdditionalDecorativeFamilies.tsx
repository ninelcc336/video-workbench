import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  ParameterDefinition,
} from "../../domain/templates/types";
import { evaluateAnimationStages } from "./animation";
import { createSeededRandom } from "./random";
import {
  createParticlePoints,
  withAlpha,
} from "./primitives";

type NormalizedPosition = { x: number; y: number };
type NormalizedSize = { width: number; height: number };

type ArrowPath = "straight" | "curved";
type ArrowDirection = "left" | "right" | "up" | "down";

type ArrowGuidanceParams = {
  position: NormalizedPosition;
  size: NormalizedSize;
  path: ArrowPath;
  direction: ArrowDirection;
  color: string;
  strokeWidth: number;
  speed: number;
  intensity: number;
  loop: boolean;
  randomSeed: string;
  stages: AnimationStageValue;
};

type FocusMode = "spotlight" | "scan-frame";
type ScanDirection = "horizontal" | "vertical";

type FocusScanParams = {
  position: NormalizedPosition;
  size: NormalizedSize;
  mode: FocusMode;
  scanDirection: ScanDirection;
  color: string;
  lineWidth: number;
  speed: number;
  intensity: number;
  loop: boolean;
  randomSeed: string;
  stages: AnimationStageValue;
};

type ParticleMode = "bubbles" | "flow";

type GeometricParticlesParams = {
  position: NormalizedPosition;
  size: NormalizedSize;
  mode: ParticleMode;
  density: number;
  particleSize: number;
  color: string;
  speed: number;
  intensity: number;
  loop: boolean;
  randomSeed: string;
  stages: AnimationStageValue;
};

const defaultStages: AnimationStageValue = {
  enter: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "none",
    easing: "ease-out",
    intensity: 1,
    stagger: 0,
  },
  sustain: {
    durationInFrames: 84,
    delayInFrames: 0,
    direction: "none",
    easing: "linear",
    intensity: 1,
    stagger: 0,
  },
  exit: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "none",
    easing: "ease-in",
    intensity: 1,
    stagger: 0,
  },
};

const arrowDefaults: ArrowGuidanceParams = {
  position: { x: 0.54, y: 0.52 },
  size: { width: 0.38, height: 0.24 },
  path: "straight",
  direction: "right",
  color: "#38bdf8",
  strokeWidth: 5,
  speed: 1.2,
  intensity: 0.8,
  loop: true,
  randomSeed: "arrow-guidance-default",
  stages: defaultStages,
};

const focusDefaults: FocusScanParams = {
  position: { x: 0.5, y: 0.5 },
  size: { width: 0.36, height: 0.3 },
  mode: "spotlight",
  scanDirection: "horizontal",
  color: "#facc15",
  lineWidth: 4,
  speed: 1.1,
  intensity: 0.82,
  loop: true,
  randomSeed: "focus-scan-default",
  stages: defaultStages,
};

const particleDefaults: GeometricParticlesParams = {
  position: { x: 0.7, y: 0.32 },
  size: { width: 0.36, height: 0.32 },
  mode: "bubbles",
  density: 12,
  particleSize: 1,
  color: "#38bdf8",
  speed: 1,
  intensity: 0.82,
  loop: true,
  randomSeed: "geometric-particles-default",
  stages: defaultStages,
};

/** 中文注释：所有装饰族只在渲染入口做有限数值收敛，真正的错误回退仍由特效族 schema 统一负责。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/** 中文注释：把循环、速度和随机相位归一为可直接跳帧求值的 0 到 1 动画相位。 */
function resolveMotionPhase(
  frame: number,
  durationInFrames: number,
  speed: number,
  loop: boolean,
  seed: string,
): number {
  const safeDuration = Math.max(1, Math.round(durationInFrames));
  const safeFrame = clamp(frame, 0, safeDuration - 1);
  const phaseOffset = createSeededRandom(`${seed}/phase`)(0);
  const rawPhase = safeFrame * clamp(speed, 0.1, 4) / safeDuration + phaseOffset * 0.18;
  return loop ? rawPhase - Math.floor(rawPhase) : clamp(rawPhase, 0, 1);
}

/** 中文注释：让聚光区域沿公开的扫描方向移动高光焦点，保证该参数对两种起始样式都可观察。 */
function getSpotlightCenter(scanDirection: ScanDirection, scanPosition: number): string {
  const travelPosition = 20 + clamp(scanPosition, 0, 1) * 60;
  return scanDirection === "vertical"
    ? `50% ${travelPosition}%`
    : `${travelPosition}% 50%`;
}

/** 中文注释：统一计算三段式动画的可见性、位移和中心帧，避免三种装饰族各自解释阶段语义。 */
function resolveDecorativeAnimation(
  frame: number,
  durationInFrames: number,
  stages: AnimationStageValue,
) {
  const animationFrame = frame + 0.5;
  return {
    ...evaluateAnimationStages({
      frame: animationFrame,
      durationInFrames,
      stages,
    }),
  };
}

/** 中文注释：把箭头方向转换成围绕 SVG 中心的旋转，几何路径本身保持同一份稳定定义。 */
function getArrowRotation(direction: ArrowDirection): number {
  switch (direction) {
    case "left":
      return 180;
    case "up":
      return -90;
    case "down":
      return 90;
    case "right":
    default:
      return 0;
  }
}

/** 中文注释：直线和曲线箭头共享箭头头部，只让路径参数决定中段几何，符合起始样式只提供默认值的约束。 */
function createArrowGeometry(
  path: ArrowPath,
  seed: string,
): { shaft: string; head: string } {
  const random = createSeededRandom(`${seed}/path`);
  const bend = (random(1) * 2 - 1) * 10;
  const baseline = 50 + (random(2) * 2 - 1) * 4;
  if (path === "curved") {
    return {
      shaft: `M 10 ${baseline + 18} Q 42 ${18 + bend} 90 ${baseline}`,
      head: `M 78 ${baseline - 9} L 90 ${baseline} L 78 ${baseline + 9}`,
    };
  }

  return {
    shaft: `M 10 ${baseline} L 90 ${baseline - bend * 0.18}`,
    head: `M 78 ${baseline - 9} L 90 ${baseline - bend * 0.18} L 78 ${baseline + 9}`,
  };
}

/** 中文注释：完整路径不再保留短 dash；只有入场尚未完成时才按百分比裁切，避免中段箭头看起来像断线。 */
function resolveArrowDrawStyle(progress: number): { strokeDasharray?: string; strokeDashoffset?: number } {
  const safeProgress = clamp(progress, 0, 1);
  if (safeProgress >= 1) return {};
  return {
    strokeDasharray: `${safeProgress * 100} 100`,
    strokeDashoffset: 0,
  };
}

/** 中文注释：箭头族把绘制、脉冲和三段式阶段合并到单个 SVG 节点，浏览器与 Remotion 都消费同一结果。 */
const ArrowGuidanceRenderer: React.FC<EffectFamilyRenderProps> = ({ frame, width, height, durationInFrames, params, startingStyleId, randomSeed }) => {
  const values = { ...arrowDefaults, ...params } as ArrowGuidanceParams;
  const animation = resolveDecorativeAnimation(frame, durationInFrames, values.stages);
  const phase = resolveMotionPhase(
    animation.frame,
    durationInFrames,
    values.speed,
    values.loop,
    `${randomSeed}/${values.randomSeed}`,
  );
  const pulse = values.loop
    ? 1 + Math.sin(phase * Math.PI * 2) * 0.08 * clamp(values.intensity, 0, 2)
    : 1;
  const opacity = animation.visibility * clamp(values.intensity, 0, 2) * (values.loop ? 0.88 + pulse * 0.08 : 0.92);
  const arrowWidth = Math.max(1, values.size.width * width);
  const arrowHeight = Math.max(1, values.size.height * height);
  const translateX = animation.offset.x * arrowWidth;
  const translateY = animation.offset.y * arrowHeight;
  const drawProgress = animation.enter.declared ? animation.enter.progress : 1;
  const geometry = createArrowGeometry(
    values.path,
    `${randomSeed}/${values.randomSeed}`,
  );
  const pathStyle = resolveArrowDrawStyle(drawProgress);
  const rotation = getArrowRotation(values.direction);

  return (
    <div
      data-effect-family="arrow-guidance"
      data-starting-style-id={startingStyleId}
      data-template-id="arrow-guidance"
      style={{
        height: arrowHeight,
        left: values.position.x * width,
        opacity,
        position: "absolute",
        top: values.position.y * height,
        transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${pulse})`,
        transformOrigin: "center",
        width: arrowWidth,
      }}
    >
      <svg
        aria-hidden="true"
        data-effect-primitive="arrow-path"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        <g transform={`rotate(${rotation} 50 50)`}>
          <path
            d={geometry.shaft}
            fill="none"
            pathLength={100}
            stroke={values.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={values.strokeWidth}
            style={pathStyle}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={geometry.head}
            fill="none"
            pathLength={100}
            stroke={values.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={values.strokeWidth}
            style={{
              ...pathStyle,
              opacity: drawProgress,
            }}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>
  );
};

const arrowParameters: ReadonlyArray<ParameterDefinition> = [
  {
    key: "position",
    label: "位置",
    description: "箭头中心在画布中的归一化位置，高级模式可有意越出安全区域。",
    type: "position",
    defaultValue: arrowDefaults.position,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "size",
    label: "尺寸",
    description: "箭头覆盖区域的宽高，路径会在区域内保持比例绘制。",
    type: "size",
    defaultValue: arrowDefaults.size,
    minWidth: 0.08,
    maxWidth: 1.4,
    minHeight: 0.08,
    maxHeight: 1.4,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "path",
    label: "路径",
    description: "选择稳定的直线或手绘曲线箭头路径。",
    type: "select",
    defaultValue: arrowDefaults.path,
    options: [
      { value: "straight", label: "直线" },
      { value: "curved", label: "曲线" },
    ],
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "direction",
    label: "方向",
    description: "旋转箭头指向左、右、上或下，不改变用户保存的尺寸。",
    type: "select",
    defaultValue: arrowDefaults.direction,
    options: [
      { value: "left", label: "左" },
      { value: "right", label: "右" },
      { value: "up", label: "上" },
      { value: "down", label: "下" },
    ],
    group: "layout",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "color",
    label: "箭头颜色",
    description: "设置箭头线条和箭头头部的颜色。",
    type: "color",
    defaultValue: arrowDefaults.color,
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "strokeWidth",
    label: "线条粗细",
    description: "设置路径描边宽度，数值越大越适合远距离指引。",
    type: "number",
    defaultValue: arrowDefaults.strokeWidth,
    min: 2,
    max: 18,
    step: 1,
    group: "appearance",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "speed",
    label: "速度",
    description: "控制箭头持续阶段的脉冲和绘制节奏。",
    type: "number",
    defaultValue: arrowDefaults.speed,
    min: 0.1,
    max: 4,
    step: 0.1,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "intensity",
    label: "强度",
    description: "控制箭头透明度和持续脉冲幅度，零值仍保留结构但不产生强烈强调。",
    type: "number",
    defaultValue: arrowDefaults.intensity,
    min: 0,
    max: 2,
    step: 0.05,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "loop",
    label: "循环",
    description: "开启后持续阶段循环脉冲，关闭后保持一次性稳定指引。",
    type: "boolean",
    defaultValue: arrowDefaults.loop,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "randomSeed",
    label: "随机种子",
    description: "固定曲线路径扰动和脉冲相位，使暂停、跳帧与导出结果稳定。",
    type: "text",
    defaultValue: arrowDefaults.randomSeed,
    maxLength: 80,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "stages",
    label: "动画阶段",
    description: "分别调整入场、持续和出场的时长、方向、缓动、强度与交错。",
    type: "animation-stage",
    defaultValue: arrowDefaults.stages,
    stages: ["enter", "sustain", "exit"],
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
];

const focusStyles: Record<FocusMode, Partial<FocusScanParams>> = {
  spotlight: {
    mode: "spotlight",
    color: "#facc15",
    intensity: 0.82,
    speed: 0.8,
    scanDirection: "horizontal",
  },
  "scan-frame": {
    mode: "scan-frame",
    color: "#22d3ee",
    intensity: 0.92,
    speed: 1.4,
    scanDirection: "horizontal",
  },
};

/** 中文注释：聚焦族用有限的 CSS 渐变和边框表达聚光，不依赖 WebGL 或真实时间，保持 2D 导出可复现。 */
const FocusScanRenderer: React.FC<EffectFamilyRenderProps> = ({ frame, width, height, durationInFrames, params, startingStyleId, randomSeed }) => {
  const values = { ...focusDefaults, ...params } as FocusScanParams;
  const animation = resolveDecorativeAnimation(frame, durationInFrames, values.stages);
  const phase = resolveMotionPhase(
    animation.frame,
    durationInFrames,
    values.speed,
    values.loop,
    `${randomSeed}/${values.randomSeed}`,
  );
  const random = createSeededRandom(`${randomSeed}/${values.randomSeed}/focus`);
  const pulse = values.loop
    ? 0.86 + Math.sin(phase * Math.PI * 2 + random(1) * Math.PI) * 0.12 * clamp(values.intensity, 0, 2)
    : 0.92;
  const regionWidth = Math.max(1, values.size.width * width);
  const regionHeight = Math.max(1, values.size.height * height);
  const translateX = animation.offset.x * regionWidth;
  const translateY = animation.offset.y * regionHeight;
  const safeIntensity = clamp(values.intensity, 0, 2);
  const opacity = animation.visibility * (0.72 + safeIntensity * 0.18);
  const scanPosition = values.loop
    ? phase
    : clamp(phase, 0, 1);
  const spotlightCenter = getSpotlightCenter(values.scanDirection, scanPosition);

  return (
    <div
      data-effect-family="focus-scan"
      data-starting-style-id={startingStyleId}
      data-template-id="focus-scan"
      style={{
        height: regionHeight,
        left: values.position.x * width,
        opacity,
        position: "absolute",
        top: values.position.y * height,
        transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${pulse})`,
        transformOrigin: "center",
        width: regionWidth,
      }}
    >
      {values.mode === "spotlight" ? (
        <div
          data-focus-mode="spotlight"
          data-spotlight-direction={values.scanDirection}
          style={{
            background: `radial-gradient(ellipse at ${spotlightCenter}, ${withAlpha(values.color, 0.28 * safeIntensity)} 0%, ${withAlpha(values.color, 0.12 * safeIntensity)} 34%, transparent 78%)`,
            border: `${values.lineWidth}px solid ${withAlpha(values.color, 0.7 * safeIntensity)}`,
            borderRadius: "50%",
            boxShadow: `0 0 ${Math.max(8, values.lineWidth * 5)}px ${withAlpha(values.color, 0.34 * safeIntensity)}`,
            height: "100%",
            position: "absolute",
            width: "100%",
          }}
        />
      ) : (
        <div
          data-focus-mode="scan-frame"
          style={{
            border: `${values.lineWidth}px solid ${withAlpha(values.color, 0.72 * safeIntensity)}`,
            boxSizing: "border-box",
            height: "100%",
            overflow: "hidden",
            position: "absolute",
            width: "100%",
          }}
        >
          <div
            data-scan-line="true"
            style={values.scanDirection === "vertical"
              ? {
                  background: `linear-gradient(90deg, transparent, ${withAlpha(values.color, 0.95 * safeIntensity)}, transparent)`,
                  height: "100%",
                  left: `${scanPosition * 100}%`,
                  position: "absolute",
                  transform: "translateX(-50%)",
                  width: `${Math.max(2, values.lineWidth * 2)}px`,
                }
              : {
                  background: `linear-gradient(180deg, transparent, ${withAlpha(values.color, 0.95 * safeIntensity)}, transparent)`,
                  height: `${Math.max(2, values.lineWidth * 2)}px`,
                  left: 0,
                  position: "absolute",
                  top: `${scanPosition * 100}%`,
                  transform: "translateY(-50%)",
                  width: "100%",
                }}
          />
        </div>
      )}
    </div>
  );
};

const focusParameters: ReadonlyArray<ParameterDefinition> = [
  {
    key: "position",
    label: "聚焦位置",
    description: "聚焦区域中心在画布中的归一化位置。",
    type: "position",
    defaultValue: focusDefaults.position,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "size",
    label: "聚焦尺寸",
    description: "聚光区域或扫描框的宽高，适配横屏和竖屏主体。",
    type: "size",
    defaultValue: focusDefaults.size,
    minWidth: 0.08,
    maxWidth: 1.4,
    minHeight: 0.08,
    maxHeight: 1.4,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "mode",
    label: "聚焦方式",
    description: "选择柔和聚光区域或边界扫描框。",
    type: "select",
    defaultValue: focusDefaults.mode,
    options: [
      { value: "spotlight", label: "聚光区域" },
      { value: "scan-frame", label: "扫描框" },
    ],
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "scanDirection",
    label: "扫描方向",
    description: "聚光焦点或扫描框高亮线沿横向或纵向移动。",
    type: "select",
    defaultValue: focusDefaults.scanDirection,
    options: [
      { value: "horizontal", label: "横向" },
      { value: "vertical", label: "纵向" },
    ],
    group: "animation",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "color",
    label: "聚焦颜色",
    description: "设置聚光边缘、扫描框和高亮线的颜色。",
    type: "color",
    defaultValue: focusDefaults.color,
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "lineWidth",
    label: "线条粗细",
    description: "设置扫描框边界和高亮线的粗细。",
    type: "number",
    defaultValue: focusDefaults.lineWidth,
    min: 1,
    max: 16,
    step: 1,
    group: "appearance",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "speed",
    label: "扫描速度",
    description: "控制扫描高亮和聚光脉冲的变化速度。",
    type: "number",
    defaultValue: focusDefaults.speed,
    min: 0.1,
    max: 4,
    step: 0.1,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "intensity",
    label: "聚焦强度",
    description: "控制聚光、边框和扫描线的透明度与强调程度。",
    type: "number",
    defaultValue: focusDefaults.intensity,
    min: 0,
    max: 2,
    step: 0.05,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "loop",
    label: "循环",
    description: "开启后持续扫描或脉冲，关闭后在片段内只运行一次。",
    type: "boolean",
    defaultValue: focusDefaults.loop,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "randomSeed",
    label: "随机种子",
    description: "固定聚光脉冲相位，保证暂停、跳帧与离线渲染一致。",
    type: "text",
    defaultValue: focusDefaults.randomSeed,
    maxLength: 80,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "stages",
    label: "动画阶段",
    description: "分别调整入场、持续和出场的时长、方向、缓动、强度与交错。",
    type: "animation-stage",
    defaultValue: focusDefaults.stages,
    stages: ["enter", "sustain", "exit"],
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
];

const particleStyles: Record<ParticleMode, Partial<GeometricParticlesParams>> = {
  bubbles: {
    mode: "bubbles",
    density: 12,
    particleSize: 1.5,
    color: "#38bdf8",
    speed: 0.8,
  },
  flow: {
    mode: "flow",
    density: 24,
    particleSize: 0.8,
    color: "#a78bfa",
    speed: 1.6,
  },
};

/** 中文注释：几何点缀族只生成受密度上限保护的 SVG 点阵，漂浮气泡与粒子流共享确定性粒子输入。 */
const GeometricParticlesRenderer: React.FC<EffectFamilyRenderProps> = ({ frame, width, height, durationInFrames, params, startingStyleId, randomSeed }) => {
  const values = { ...particleDefaults, ...params } as GeometricParticlesParams;
  const animation = resolveDecorativeAnimation(frame, durationInFrames, values.stages);
  const seed = `${randomSeed}/${values.randomSeed}/${values.mode}`;
  const safeFrame = values.loop
    ? animation.frame * clamp(values.speed, 0.1, 4)
    : Math.min(animation.frame * clamp(values.speed, 0.1, 4), durationInFrames - 1);
  const points = createParticlePoints(seed, values.density, safeFrame);
  const regionWidth = Math.max(1, values.size.width * width);
  const regionHeight = Math.max(1, values.size.height * height);
  const translateX = animation.offset.x * regionWidth;
  const translateY = animation.offset.y * regionHeight;
  const random = createSeededRandom(`${seed}/flow`);
  const safeIntensity = clamp(values.intensity, 0, 2);
  const particleScale = clamp(values.particleSize, 0.3, 2.5);
  const phase = resolveMotionPhase(
    animation.frame,
    durationInFrames,
    values.speed,
    values.loop,
    seed,
  );
  const loopOpacity = values.loop
    ? 0.86 + Math.sin(phase * Math.PI * 2 + random(9)) * 0.1
    : 0.92;

  return (
    <div
      data-effect-family="geometric-particles"
      data-starting-style-id={startingStyleId}
      data-template-id="geometric-particles"
      style={{
        height: regionHeight,
        left: values.position.x * width,
        opacity: animation.visibility * safeIntensity * loopOpacity,
        position: "absolute",
        top: values.position.y * height,
        transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px))`,
        width: regionWidth,
      }}
    >
      <svg
        aria-hidden="true"
        data-effect-primitive="geometric-particles"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        {values.mode === "bubbles"
          ? points.map((point, index) => {
              const radius = Math.max(0.8, point.size * particleScale * (0.9 + safeIntensity * 0.45));
              return (
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill={withAlpha(values.color, point.opacity * 0.78)}
                  key={index}
                  r={radius}
                  stroke={withAlpha(values.color, point.opacity * 0.52)}
                  strokeWidth={Math.max(0.4, particleScale * 0.22)}
                />
              );
            })
          : points.map((point, index) => {
              const drift = Math.sin((phase + index * 0.07) * Math.PI * 2) * 3 * safeIntensity;
              const size = Math.max(0.8, point.size * particleScale);
              const tail = Math.max(2, size * (2.5 + values.speed));
              return (
                <g key={index} transform={`translate(${drift} 0)`}>
                  <line
                    data-particle-trail={index}
                    opacity={point.opacity * 0.42}
                    stroke={values.color}
                    strokeLinecap="round"
                    strokeWidth={Math.max(0.5, size * 0.42)}
                    x1={point.x - tail}
                    x2={point.x}
                    y1={point.y}
                    y2={point.y}
                  />
                  <polygon
                    fill={values.color}
                    opacity={point.opacity}
                    points={`${point.x + size},${point.y} ${point.x},${point.y - size} ${point.x - size},${point.y} ${point.x},${point.y + size}`}
                  />
                </g>
              );
            })}
      </svg>
    </div>
  );
};

const particleParameters: ReadonlyArray<ParameterDefinition> = [
  {
    key: "position",
    label: "点缀位置",
    description: "点缀区域中心在画布中的归一化位置。",
    type: "position",
    defaultValue: particleDefaults.position,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "size",
    label: "点缀区域",
    description: "气泡或粒子流的覆盖宽高，窄画幅会使用起始样式的独立默认值。",
    type: "size",
    defaultValue: particleDefaults.size,
    minWidth: 0.08,
    maxWidth: 1.4,
    minHeight: 0.08,
    maxHeight: 1.4,
    group: "layout",
    level: "basic",
    styleSwitch: "preserve",
    safety: "warn-on-overflow",
  },
  {
    key: "mode",
    label: "点缀方式",
    description: "选择漂浮气泡或带方向感的几何粒子流。",
    type: "select",
    defaultValue: particleDefaults.mode,
    options: [
      { value: "bubbles", label: "漂浮气泡" },
      { value: "flow", label: "几何粒子流" },
    ],
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "density",
    label: "密度",
    description: "控制点缀数量，最高 64 个以保护浏览器预览与离线渲染负载。",
    type: "number",
    defaultValue: particleDefaults.density,
    min: 1,
    max: 64,
    step: 1,
    group: "behavior",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "particleSize",
    label: "粒子尺寸",
    description: "控制气泡半径或几何粒子边长，不改变区域布局。",
    type: "number",
    defaultValue: particleDefaults.particleSize,
    min: 0.3,
    max: 2.5,
    step: 0.1,
    group: "appearance",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "color",
    label: "点缀颜色",
    description: "设置气泡、粒子和运动尾迹的颜色。",
    type: "color",
    defaultValue: particleDefaults.color,
    group: "appearance",
    level: "basic",
    styleSwitch: "replace",
  },
  {
    key: "speed",
    label: "漂浮速度",
    description: "控制气泡漂浮、粒子流位移和尾迹长度的变化速度。",
    type: "number",
    defaultValue: particleDefaults.speed,
    min: 0.1,
    max: 4,
    step: 0.1,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "intensity",
    label: "点缀强度",
    description: "控制粒子透明度、大小和持续阶段的强调程度。",
    type: "number",
    defaultValue: particleDefaults.intensity,
    min: 0,
    max: 2,
    step: 0.05,
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "loop",
    label: "循环",
    description: "开启后点缀持续循环漂浮，关闭后在片段内完成一次运动并停住。",
    type: "boolean",
    defaultValue: particleDefaults.loop,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "randomSeed",
    label: "随机种子",
    description: "固定粒子分布、路径相位和扰动，确保刷新、跳帧与导出一致。",
    type: "text",
    defaultValue: particleDefaults.randomSeed,
    maxLength: 80,
    group: "behavior",
    level: "advanced",
    styleSwitch: "replace",
  },
  {
    key: "stages",
    label: "动画阶段",
    description: "分别调整入场、持续和出场的时长、方向、缓动、强度与交错。",
    type: "animation-stage",
    defaultValue: particleDefaults.stages,
    stages: ["enter", "sustain", "exit"],
    group: "animation",
    level: "advanced",
    styleSwitch: "replace",
  },
];

/** 中文注释：每个新增族都显式声明三种画幅布局，避免通过机械坐标缩放把主体推到画布边界之外。 */
function aspectRatioLayouts(
  wide: { position: NormalizedPosition; size: NormalizedSize },
  portrait: { position: NormalizedPosition; size: NormalizedSize },
  square: { position: NormalizedPosition; size: NormalizedSize },
) {
  return {
    "16:9": wide,
    "9:16": portrait,
    "1:1": square,
  };
}

const arrowStyleDefaults = {
  "pulse-arrow": {
    path: "straight",
    direction: "right",
    color: "#38bdf8",
    speed: 1.4,
    intensity: 0.86,
  },
  "hand-drawn-curve-arrow": {
    path: "curved",
    direction: "right",
    color: "#f59e0b",
    speed: 0.9,
    intensity: 0.94,
  },
} as const;

const focusStyleDefaults = {
  spotlight: focusStyles.spotlight,
  "scan-frame": focusStyles["scan-frame"],
} as const;

const particleStyleDefaults = {
  "floating-bubbles": particleStyles.bubbles,
  "geometric-particle-flow": particleStyles.flow,
} as const;

/** 中文注释：箭头族的起始样式只组合路径、颜色和动画默认值，渲染能力仍由同一个族组件提供。 */
const arrowStartingStyles = [
  {
    id: "pulse-arrow",
    name: "脉冲直箭头",
    description: "以稳定直线和轻微脉冲把观众注意力引向目标。",
    visualDirection: "活力社媒",
    defaultParams: arrowStyleDefaults["pulse-arrow"],
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.56, y: 0.54 }, size: { width: 0.34, height: 0.2 } },
      { position: { x: 0.5, y: 0.62 }, size: { width: 0.68, height: 0.18 } },
      { position: { x: 0.54, y: 0.58 }, size: { width: 0.48, height: 0.2 } },
    ),
  },
  {
    id: "hand-drawn-curve-arrow",
    name: "手绘曲线箭头",
    description: "以带有确定性轻微扰动的曲线路径模拟批注式引导。",
    visualDirection: "手绘批注",
    defaultParams: arrowStyleDefaults["hand-drawn-curve-arrow"],
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.52, y: 0.58 }, size: { width: 0.42, height: 0.28 } },
      { position: { x: 0.5, y: 0.58 }, size: { width: 0.72, height: 0.26 } },
      { position: { x: 0.5, y: 0.56 }, size: { width: 0.54, height: 0.3 } },
    ),
  },
] as const;

/** 中文注释：聚焦族的起始样式只预置聚光或扫描参数，样式切换不会另建一套渲染分支。 */
const focusStartingStyles = [
  {
    id: "spotlight",
    name: "聚光区域",
    description: "用柔和的色彩光晕把主体从背景中托出来。",
    visualDirection: "简洁信息",
    defaultParams: focusStyleDefaults.spotlight,
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.5, y: 0.48 }, size: { width: 0.34, height: 0.3 } },
      { position: { x: 0.5, y: 0.46 }, size: { width: 0.62, height: 0.24 } },
      { position: { x: 0.5, y: 0.48 }, size: { width: 0.44, height: 0.36 } },
    ),
  },
  {
    id: "scan-frame",
    name: "扫描框",
    description: "用边界框和扫描线建立科技感的聚焦节奏。",
    visualDirection: "科技数据",
    defaultParams: focusStyleDefaults["scan-frame"],
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.5, y: 0.5 }, size: { width: 0.46, height: 0.36 } },
      { position: { x: 0.5, y: 0.5 }, size: { width: 0.72, height: 0.3 } },
      { position: { x: 0.5, y: 0.5 }, size: { width: 0.58, height: 0.44 } },
    ),
  },
] as const;

/** 中文注释：几何点缀族迁移旧气泡语义到新族内起始样式，另一种样式共享同一粒子生成器。 */
const particleStartingStyles = [
  {
    id: "floating-bubbles",
    name: "漂浮气泡",
    description: "用轻量圆形气泡增加画面边缘的呼吸感和节奏。",
    visualDirection: "活力社媒",
    defaultParams: particleStyleDefaults["floating-bubbles"],
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.76, y: 0.28 }, size: { width: 0.3, height: 0.28 } },
      { position: { x: 0.76, y: 0.24 }, size: { width: 0.42, height: 0.24 } },
      { position: { x: 0.72, y: 0.28 }, size: { width: 0.34, height: 0.3 } },
    ),
  },
  {
    id: "geometric-particle-flow",
    name: "几何粒子流",
    description: "用菱形粒子和短尾迹制造轻快、可控的流动方向。",
    visualDirection: "科技数据",
    defaultParams: particleStyleDefaults["geometric-particle-flow"],
    aspectRatioDefaults: aspectRatioLayouts(
      { position: { x: 0.68, y: 0.62 }, size: { width: 0.42, height: 0.28 } },
      { position: { x: 0.66, y: 0.68 }, size: { width: 0.46, height: 0.3 } },
      { position: { x: 0.68, y: 0.64 }, size: { width: 0.42, height: 0.34 } },
    ),
  },
] as const;

export const ArrowGuidance = Object.assign(ArrowGuidanceRenderer, {
  definition: defineEffectFamily({
    id: "arrow-guidance",
    version: 1,
    category: "decorative-animation",
    name: "箭头与引导线",
    description: "用直线或手绘曲线箭头把观众注意力引向画面中的目标。",
    purposeTags: ["引导", "重点标注", "批注"],
    visualDirections: ["活力社媒", "手绘批注"],
    defaultDurationInFrames: 120,
    parameters: arrowParameters,
    startingStyles: arrowStartingStyles,
    aspectRatioDefaults: {},
    render: (props) => <ArrowGuidanceRenderer {...props} />,
  }),
});

export const FocusScan = Object.assign(FocusScanRenderer, {
  definition: defineEffectFamily({
    id: "focus-scan",
    version: 1,
    category: "decorative-animation",
    name: "聚焦与扫描",
    description: "用聚光区域或扫描框集中观众对画面主体的注意力。",
    purposeTags: ["聚焦", "重点标注", "节奏"],
    visualDirections: ["简洁信息", "科技数据"],
    defaultDurationInFrames: 120,
    parameters: focusParameters,
    startingStyles: focusStartingStyles,
    aspectRatioDefaults: {},
    render: (props) => <FocusScanRenderer {...props} />,
  }),
});

export const GeometricParticles = Object.assign(GeometricParticlesRenderer, {
  definition: defineEffectFamily({
    id: "geometric-particles",
    version: 1,
    category: "decorative-animation",
    name: "几何点缀与粒子",
    description: "用确定性气泡和轻量几何粒子为知识画面增加层次与节奏。",
    purposeTags: ["装饰", "节奏", "背景点缀"],
    visualDirections: ["活力社媒", "科技数据"],
    defaultDurationInFrames: 120,
    parameters: particleParameters,
    startingStyles: particleStartingStyles,
    aspectRatioDefaults: {},
    render: (props) => <GeometricParticlesRenderer {...props} />,
  }),
});
