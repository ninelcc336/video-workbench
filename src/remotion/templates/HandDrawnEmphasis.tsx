import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
} from "../../domain/templates/types";
import { evaluateAnimationStages, type AnimationPhaseEvaluation } from "./animation";
import { createSeededRandom } from "./random";

type HandDrawnPoint = { x: number; y: number };
type HandDrawnStyleId = "underline" | "highlighter" | "circle" | "box";

export type HandDrawnEmphasisParams = {
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  shape: HandDrawnStyleId;
  color: string;
  strokeWidth: number;
  roughness: number;
  pathDirection: "forward" | "reverse";
  drawDuration: number;
  randomSeed: string;
  stages: AnimationStageValue;
};

const defaultStages: AnimationStageValue = {
  enter: {
    durationInFrames: 24,
    delayInFrames: 0,
    direction: "none",
    easing: "ease-out",
    intensity: 1,
    stagger: 0,
  },
  sustain: {
    durationInFrames: 96,
    delayInFrames: 0,
    direction: "none",
    easing: "linear",
    intensity: 1,
    stagger: 0,
  },
  exit: {
    durationInFrames: 24,
    delayInFrames: 0,
    direction: "none",
    easing: "ease-in",
    intensity: 1,
    stagger: 0,
  },
};

const defaultParams: HandDrawnEmphasisParams = {
  position: { x: 0.5, y: 0.64 },
  size: { width: 0.44, height: 0.22 },
  rotation: 0,
  shape: "underline",
  color: "#fbbf24",
  strokeWidth: 8,
  roughness: 0.32,
  pathDirection: "forward",
  drawDuration: 24,
  randomSeed: "hand-drawn-default",
  stages: defaultStages,
};

const styleDefaults: Record<HandDrawnStyleId, Partial<HandDrawnEmphasisParams>> = {
  underline: {
    shape: "underline",
    color: "#fbbf24",
    rotation: -2,
    roughness: 0.28,
    strokeWidth: 8,
  },
  highlighter: {
    shape: "highlighter",
    color: "#facc15",
    rotation: 1,
    roughness: 0.2,
    strokeWidth: 18,
  },
  circle: {
    shape: "circle",
    color: "#fb7185",
    rotation: -4,
    roughness: 0.42,
    strokeWidth: 7,
  },
  box: {
    shape: "box",
    color: "#38bdf8",
    rotation: 2,
    roughness: 0.36,
    strokeWidth: 7,
  },
};

type HandDrawnStyleSpec = {
  closePath: boolean;
  strokeOpacity: number;
  createPoints: (random: (index?: number) => number, roughness: number) => HandDrawnPoint[];
};

/** 中文注释：把起始样式的几何差异集中为声明式规格，避免路径和视觉属性在渲染入口重复分支。 */
const handDrawnStyleSpecs: Record<HandDrawnStyleId, HandDrawnStyleSpec> = {
  underline: {
    closePath: false,
    strokeOpacity: 1,
    createPoints: (random, rough) => Array.from({ length: 15 }, (_, index) => {
      const progress = index / 14;
      return {
        x: 7 + progress * 86 + createNoise(random, index * 2, rough * 1.5),
        y: 50 + createNoise(random, index * 2 + 1, rough * 7),
      };
    }),
  },
  highlighter: {
    closePath: false,
    strokeOpacity: 0.58,
    createPoints: (random, rough) => Array.from({ length: 15 }, (_, index) => {
      const progress = index / 14;
      return {
        x: 7 + progress * 86 + createNoise(random, index * 2, rough * 1.5),
        y: 50
          + Math.sin(progress * Math.PI * 2) * 1.5
          + createNoise(random, index * 2 + 1, rough * 4),
      };
    }),
  },
  circle: {
    closePath: true,
    strokeOpacity: 1,
    createPoints: (random, rough) => Array.from({ length: 20 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 20;
      const radius = 1 + createNoise(random, index, rough * 0.11);
      return {
        x: 50 + Math.cos(angle) * 39 * radius,
        y: 50 + Math.sin(angle) * 36 * radius,
      };
    }),
  },
  box: {
    closePath: true,
    strokeOpacity: 1,
    createPoints: (random, rough) => {
      const corners = [
        { x: 12, y: 18 },
        { x: 88, y: 18 },
        { x: 88, y: 82 },
        { x: 12, y: 82 },
      ];
      return corners.flatMap((corner, cornerIndex) => [
        {
          x: corner.x + createNoise(random, cornerIndex * 3, rough * 4),
          y: corner.y + createNoise(random, cornerIndex * 3 + 1, rough * 4),
        },
        {
          x: corner.x + createNoise(random, cornerIndex * 3 + 2, rough * 2),
          y: corner.y + createNoise(random, cornerIndex * 3 + 3, rough * 2),
        },
      ]);
    },
  },
};

/** 中文注释：限制只用于动画进度和几何扰动，参数本身仍由特效族校验器决定是否回退或警告。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 中文注释：按固定索引生成扰动值，保证同一种子跳帧、刷新和 Remotion 离线渲染都得到同一条路径。 */
function createNoise(random: (index?: number) => number, index: number, amplitude: number): number {
  return (random(index) * 2 - 1) * amplitude;
}

/** 中文注释：把点序列编码成 SVG 路径；只使用固定小数位，避免不同渲染环境产生无意义字符串差异。 */
function pointsToPath(points: HandDrawnPoint[], closePath: boolean): string {
  const path = points.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
  }).join(" ");
  return closePath ? `${path} Z` : path;
}

/** 中文注释：公共渲染输入已校验起始样式；直接绕过输入工厂时则抛出明确错误，避免静默改变外观。 */
function resolveHandDrawnStyleSpec(styleId: string): HandDrawnStyleSpec {
  const style = handDrawnStyleSpecs[styleId as HandDrawnStyleId];
  if (!style) throw new Error(`未找到手绘重点标注起始样式：${styleId}`);
  return style;
}

/** 中文注释：四种起始样式只通过规格改变路径形状，随机采样和描边/动画参数仍由同一特效族共享。 */
function createHandDrawnPath(
  shape: HandDrawnStyleId,
  roughness: number,
  seed: string,
  pathDirection: HandDrawnEmphasisParams["pathDirection"],
): string {
  const random = createSeededRandom(`${seed}/${shape}`);
  const rough = clamp(roughness, 0, 1);
  const style = resolveHandDrawnStyleSpec(shape);
  const points = style.createPoints(random, rough);

  if (pathDirection === "reverse") points.reverse();
  return pointsToPath(points, style.closePath);
}

/** 中文注释：绘制进度只由入场起点、公开绘制时长和当前帧决定，暂停或直接跳帧不会丢失路径状态。 */
function resolveDrawProgress(frame: number, drawDuration: number, enterStartFrame: number): number {
  const duration = Math.max(1, Math.round(drawDuration));
  return clamp((frame - enterStartFrame) / duration, 0, 1);
}

/** 中文注释：只在声明且当前有效的持续阶段内使用固定正弦微动，阶段缺失或零时长时保持布局静止。 */
function resolveSustainScale(
  frame: number,
  seed: string,
  sustain: AnimationPhaseEvaluation,
): number {
  if (!sustain.declared || sustain.endFrame <= sustain.startFrame || !sustain.active) return 1;

  const phase = createSeededRandom(seed)(97) * Math.PI * 2;
  const amplitude = 0.025 * clamp(sustain.intensity, 0, 4);
  return 1 + Math.sin(sustain.progress * Math.PI * 2 + phase) * amplitude;
}

/** 中文注释：把手绘族的阶段求值集中在渲染入口，浏览器预览和 Remotion 只消费同一份 CSS/SVG 结果。 */
export const HandDrawnEmphasis: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId, randomSeed }) => {
  const values = { ...defaultParams, ...params } as HandDrawnEmphasisParams;
  // 中文注释：固定帧代表该帧时间窗的中心，避免首帧和末帧因连续函数恰好落在零点而产生空白。
  const animationFrame = frame + 0.5;
  const stages = evaluateAnimationStages({
    frame: animationFrame,
    durationInFrames,
    stages: values.stages,
  });
  const path = createHandDrawnPath(
    values.shape,
    values.roughness,
    `${randomSeed}/${values.randomSeed}`,
    values.pathDirection,
  );
  const drawProgress = resolveDrawProgress(
    animationFrame,
    values.drawDuration,
    stages.enter.startFrame,
  );
  const dashOffset = 1 - drawProgress;
  const style = resolveHandDrawnStyleSpec(values.shape);
  const sustainScale = resolveSustainScale(
    animationFrame,
    `${randomSeed}/${values.randomSeed}`,
    stages.sustain,
  );
  const widthInPixels = Math.max(1, values.size.width * width);
  const heightInPixels = Math.max(1, values.size.height * height);
  const translateX = stages.offset.x * widthInPixels;
  const translateY = stages.offset.y * heightInPixels;

  return (
    <div
      data-effect-family="hand-drawn-emphasis"
      data-starting-style-id={startingStyleId}
      data-template-id="hand-drawn-emphasis"
      style={{
        height: heightInPixels,
        left: values.position.x * width,
        opacity: stages.visibility,
        position: "absolute",
        top: values.position.y * height,
        transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) rotate(${values.rotation}deg) scale(${sustainScale})`,
        transformOrigin: "center",
        width: widthInPixels,
      }}
    >
      <svg
        aria-hidden="true"
        data-effect-primitive="hand-drawn-path"
        data-hand-drawn-path="true"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        <path
          d={path}
          fill="none"
          pathLength={1}
          stroke={values.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            opacity: style.strokeOpacity,
            strokeDasharray: 1,
            strokeDashoffset: dashOffset,
            strokeWidth: values.strokeWidth,
          }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

const handDrawnParameters = [
  {
    key: "position",
    label: "位置",
    description: "标注中心在画布中的归一化位置，基础模式优先保持在安全区域内。",
    type: "position" as const,
    defaultValue: defaultParams.position,
    group: "layout" as const,
    level: "basic" as const,
    styleSwitch: "preserve" as const,
    safety: "warn-on-overflow" as const,
  },
  {
    key: "size",
    label: "尺寸",
    description: "标注区域相对画布的宽高，尺寸变化会同步影响路径覆盖范围。",
    type: "size" as const,
    defaultValue: defaultParams.size,
    minWidth: 0.04,
    maxWidth: 1.3,
    minHeight: 0.04,
    maxHeight: 1.3,
    group: "layout" as const,
    level: "basic" as const,
    styleSwitch: "preserve" as const,
    safety: "warn-on-overflow" as const,
  },
  {
    key: "rotation",
    label: "旋转",
    description: "以度数旋转整组手绘路径，适合模拟自然的批注倾斜。",
    type: "number" as const,
    defaultValue: defaultParams.rotation,
    min: -180,
    max: 180,
    step: 1,
    group: "layout" as const,
    level: "basic" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "shape",
    label: "标注形状",
    description: "选择下划线、荧光笔、圈选或方框，起始样式会预置对应形状。",
    type: "select" as const,
    defaultValue: defaultParams.shape,
    options: [
      { value: "underline", label: "下划线" },
      { value: "highlighter", label: "荧光笔" },
      { value: "circle", label: "圈选" },
      { value: "box", label: "方框" },
    ],
    group: "appearance" as const,
    level: "basic" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "color",
    label: "标注颜色",
    description: "设置手绘路径的描边颜色，荧光笔样式会额外保留半透明笔触。",
    type: "color" as const,
    defaultValue: defaultParams.color,
    group: "appearance" as const,
    level: "basic" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "strokeWidth",
    label: "线条粗细",
    description: "设置路径描边宽度，数值越大越接近粗记号笔效果。",
    type: "number" as const,
    defaultValue: defaultParams.strokeWidth,
    min: 2,
    max: 24,
    step: 1,
    group: "appearance" as const,
    level: "basic" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "roughness",
    label: "手绘粗糙度",
    description: "控制路径点的确定性扰动幅度，数值越大越不规则。",
    type: "number" as const,
    defaultValue: defaultParams.roughness,
    min: 0,
    max: 1,
    step: 0.01,
    group: "appearance" as const,
    level: "basic" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "pathDirection",
    label: "路径方向",
    description: "选择从路径起点或终点开始绘制，影响入场时的书写方向。",
    type: "select" as const,
    defaultValue: defaultParams.pathDirection,
    options: [
      { value: "forward", label: "正向" },
      { value: "reverse", label: "反向" },
    ],
    group: "animation" as const,
    level: "advanced" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "drawDuration",
    label: "绘制时长",
    description: "设置路径从不可见绘制到完整显示所需的帧数。",
    type: "number" as const,
    defaultValue: defaultParams.drawDuration,
    min: 1,
    max: 90,
    step: 1,
    group: "animation" as const,
    level: "advanced" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "randomSeed",
    label: "随机种子",
    description: "固定手绘扰动的种子，使跳帧、预览和导出保持相同路径。",
    type: "text" as const,
    defaultValue: defaultParams.randomSeed,
    maxLength: 80,
    group: "behavior" as const,
    level: "advanced" as const,
    styleSwitch: "replace" as const,
  },
  {
    key: "stages",
    label: "动画阶段",
    description: "分别配置入场、持续和出场阶段的时长、方向、缓动与强度。",
    type: "animation-stage" as const,
    defaultValue: defaultParams.stages,
    stages: ["enter", "sustain", "exit"] as const,
    group: "animation" as const,
    level: "advanced" as const,
    styleSwitch: "replace" as const,
  },
];

HandDrawnEmphasis.definition = defineEffectFamily({
  id: "hand-drawn-emphasis",
  version: 1,
  category: "decorative-animation",
  name: "手绘重点标注",
  description: "用下划线、荧光笔、圈选或方框强调画面中的重点区域。",
  purposeTags: ["重点标注", "强调", "批注"],
  visualDirections: ["手绘批注", "活力社媒"],
  defaultDurationInFrames: 144,
  parameters: handDrawnParameters,
  startingStyles: [
    {
      id: "underline",
      name: "手绘下划线",
      description: "用轻微抖动的手绘线条强调一句话或一个短词。",
      visualDirection: "手绘批注",
      defaultParams: styleDefaults.underline,
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.68 }, size: { width: 0.54, height: 0.12 } },
        "9:16": { position: { x: 0.5, y: 0.62 }, size: { width: 0.78, height: 0.12 } },
        "1:1": { position: { x: 0.5, y: 0.6 }, size: { width: 0.64, height: 0.14 } },
      },
    },
    {
      id: "highlighter",
      name: "荧光笔",
      description: "用宽笔触快速扫过需要记住的重点。",
      visualDirection: "活力社媒",
      defaultParams: styleDefaults.highlighter,
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.52 }, size: { width: 0.56, height: 0.14 } },
        "9:16": { position: { x: 0.5, y: 0.48 }, size: { width: 0.8, height: 0.14 } },
        "1:1": { position: { x: 0.5, y: 0.48 }, size: { width: 0.66, height: 0.16 } },
      },
    },
    {
      id: "circle",
      name: "圈选",
      description: "用不规则圆圈把画面中的对象或数字圈出来。",
      visualDirection: "手绘批注",
      defaultParams: styleDefaults.circle,
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.52 }, size: { width: 0.38, height: 0.3 } },
        "9:16": { position: { x: 0.5, y: 0.5 }, size: { width: 0.62, height: 0.24 } },
        "1:1": { position: { x: 0.5, y: 0.5 }, size: { width: 0.44, height: 0.38 } },
      },
    },
    {
      id: "box",
      name: "方框",
      description: "用粗细适中的手绘方框标出一块信息区域。",
      visualDirection: "手绘批注",
      defaultParams: styleDefaults.box,
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.52 }, size: { width: 0.48, height: 0.34 } },
        "9:16": { position: { x: 0.5, y: 0.5 }, size: { width: 0.72, height: 0.3 } },
        "1:1": { position: { x: 0.5, y: 0.5 }, size: { width: 0.56, height: 0.44 } },
      },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <HandDrawnEmphasis {...props} />,
});
