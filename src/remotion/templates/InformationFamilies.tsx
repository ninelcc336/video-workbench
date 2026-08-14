import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  GradientValue,
} from "../../domain/templates/types";
import { BuiltInAssetImage, EffectCard, ResponsiveText, withAlpha } from "./primitives";
import { evaluateAnimationStages } from "./animation";

const fontOptions = [
  { value: "font.system-sans", label: "系统无衬线" },
  { value: "font.system-mono", label: "系统等宽" },
];

const iconOptions = [{ value: "icon.check", label: "勾选" }];

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

type SurfaceAppearance = "none" | "solid" | "glass" | "outline";
type TextAlignment = "left" | "center" | "right";

/** 中文注释：按卡片外观集中解析背景、渐变、描边和阴影，保证四个信息族共享同一套视觉语义。 */
function resolveSurfaceAppearance(input: {
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

/** 中文注释：将三段式动画求值为透明度和位移，所有结果只依赖局部帧，支持暂停、跳帧和离线导出。 */
function resolveMotion(
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

/** 中文注释：按默认阶段生成不同视觉方向的动画声明，起始样式只覆盖参数，不复制族级求值代码。 */
function createStages(input: {
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

/** 中文注释：给信息卡内文字预留稳定空间，极端长文本由 ResponsiveText 缩小字号而不是撑破卡片。 */
function getContentBox(input: {
  width: number;
  height: number;
  spacing: { top: number; right: number; bottom: number; left: number };
}): { width: number; height: number } {
  return {
    width: Math.max(1, input.width - input.spacing.left - input.spacing.right),
    height: Math.max(1, input.height - input.spacing.top - input.spacing.bottom),
  };
}

export type TitleLayerParams = {
  chapterNumber: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  showIcon: boolean;
  icon: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  font: string;
  fontSize: number;
  fontWeight: "500" | "600" | "700" | "800";
  textColor: string;
  mutedColor: string;
  accentColor: string;
  surface: SurfaceAppearance;
  surfaceColor: string;
  surfaceOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  spacing: { top: number; right: number; bottom: number; left: number };
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const titleLayerDefaults: TitleLayerParams = {
  chapterNumber: "01",
  eyebrow: "CHAPTER 01",
  title: "一个值得关注的主题",
  subtitle: "用清晰的信息层讲好一个观点",
  showSubtitle: true,
  showIcon: false,
  icon: "icon.check",
  position: { x: 0.3, y: 0.28 },
  size: { width: 0.52, height: 0.28 },
  alignment: "left",
  font: "font.system-sans",
  fontSize: 44,
  fontWeight: "800",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  accentColor: "#2dd4bf",
  surface: "none",
  surfaceColor: "#0f172a",
  surfaceOpacity: 0.86,
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 18,
  spacing: { top: 22, right: 24, bottom: 22, left: 24 },
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#0f172a" },
      { offset: 1, color: "#172554" },
    ],
  },
  stages: createStages({ enterDirection: "left", exitDirection: "right" }),
};

/** 中文注释：渲染标题层的编号、眉标题、主标题和可选副标题，样式差异完全由族参数驱动。 */
export const TitleLayer: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...titleLayerDefaults, ...params } as TitleLayerParams;
  const cardWidth = Math.max(1, values.size.width * width);
  const cardHeight = Math.max(1, values.size.height * height);
  const content = getContentBox({ width: cardWidth, height: cardHeight, spacing: values.spacing });
  const motion = resolveMotion(values.stages, frame, durationInFrames, width, height);
  const surface = resolveSurfaceAppearance({
    appearance: values.surface,
    color: values.surfaceColor,
    opacity: values.surfaceOpacity,
    gradient: values.gradient,
    borderColor: values.borderColor,
    borderWidth: values.borderWidth,
  });
  const titleHeight = Math.max(1, content.height * (values.showSubtitle ? 0.52 : 0.72));
  const subtitleHeight = Math.max(1, content.height - titleHeight - 10);

  return (
    <div
      data-effect-family="title-layer"
      data-starting-style-id={startingStyleId}
      data-template-id="title-layer"
      style={{
        height: cardHeight,
        left: values.position.x * width,
        opacity: motion.opacity,
        position: "absolute",
        top: values.position.y * height,
        transform: `translate(-50%, -50%) ${motion.transform}`,
        width: cardWidth,
      }}
    >
      <EffectCard
        background={surface.background}
        borderColor={surface.borderColor}
        borderRadius={values.radius}
        borderWidth={surface.borderWidth}
        gradient={surface.gradient}
        shadow={surface.shadow}
        style={{ height: "100%", width: "100%" }}
      >
        <div
          style={{
            boxSizing: "border-box",
            height: "100%",
            padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`,
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 10, height: titleHeight * 0.22, justifyContent: values.alignment }}>
            {values.showIcon ? <BuiltInAssetImage assetId={values.icon} style={{ height: 18, width: 18 }} /> : null}
            <span style={{ color: values.accentColor, fontFamily: "var(--effect-font-system-mono)", fontSize: Math.max(12, values.fontSize * 0.34), fontWeight: 800, letterSpacing: 2 }}>
              {values.chapterNumber}
            </span>
            <span style={{ color: values.accentColor, fontFamily: "var(--effect-font-system-mono)", fontSize: Math.max(10, values.fontSize * 0.24), fontWeight: 700, letterSpacing: 2 }}>
              {values.eyebrow}
            </span>
          </div>
          <div style={{ borderLeft: values.alignment === "left" ? `3px solid ${values.accentColor}` : undefined, borderRight: values.alignment === "right" ? `3px solid ${values.accentColor}` : undefined, paddingLeft: values.alignment === "left" ? 14 : 0, paddingRight: values.alignment === "right" ? 14 : 0 }}>
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={values.fontSize}
              height={titleHeight}
              maxLines={3}
              maxWidth={content.width}
              style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
              text={values.title}
              width={content.width}
            />
            {values.showSubtitle && values.subtitle ? (
              <ResponsiveText
                fontAssetId={values.font}
                fontSize={Math.max(12, values.fontSize * 0.42)}
                height={subtitleHeight}
                maxLines={2}
                maxWidth={content.width}
                style={{ color: values.mutedColor, marginTop: 10, textAlign: values.alignment }}
                text={values.subtitle}
                width={content.width}
              />
            ) : null}
          </div>
        </div>
      </EffectCard>
    </div>
  );
};

TitleLayer.definition = defineEffectFamily({
  id: "title-layer",
  version: 1,
  category: "information-overlay",
  name: "标题层",
  description: "用编号、眉标题、主标题和副标题建立知识视频的章节层级。",
  purposeTags: ["标题", "章节"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 144,
  parameters: [
    { key: "chapterNumber", label: "章节编号", description: "标题层前置的章节或序号文本。", type: "text", defaultValue: titleLayerDefaults.chapterNumber, maxLength: 8, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "eyebrow", label: "眉标题", description: "主标题上方的短标签或英文眉标题。", type: "text", defaultValue: titleLayerDefaults.eyebrow, maxLength: 30, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "title", label: "主标题", description: "章节层最重要的主标题内容。", type: "multiline-text", defaultValue: titleLayerDefaults.title, maxLength: 80, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "subtitle", label: "副标题", description: "用于补充主标题语义的短说明。", type: "multiline-text", defaultValue: titleLayerDefaults.subtitle, maxLength: 120, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "showSubtitle", label: "显示副标题", description: "控制副标题是否参与当前标题层布局。", type: "boolean", defaultValue: titleLayerDefaults.showSubtitle, group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "showIcon", label: "显示图标", description: "在编号旁显示审核过的内置图标。", type: "boolean", defaultValue: titleLayerDefaults.showIcon, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "icon", label: "标题图标", description: "标题层使用的内置图标素材槽位。", type: "icon", defaultValue: titleLayerDefaults.icon, options: iconOptions, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "position", label: "位置", description: "标题层中心点在画布中的安全位置。", type: "position", defaultValue: titleLayerDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "标题层在画布中的宽高比例。", type: "size", defaultValue: titleLayerDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "标题和辅助文本的水平对齐方式。", type: "select", defaultValue: titleLayerDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "标题卡内容与边界之间的四边间距。", type: "spacing", defaultValue: titleLayerDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "标题层使用的内置字体素材槽位。", type: "font", defaultValue: titleLayerDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "主标题请求字号，超长文本会在安全区域内自适应。", type: "number", defaultValue: titleLayerDefaults.fontSize, min: 18, max: 96, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "主标题的内置字体字重选择。", type: "select", defaultValue: titleLayerDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "主标题颜色", description: "主标题文字颜色。", type: "color", defaultValue: titleLayerDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "副标题颜色", description: "眉标题和副标题的辅助文字颜色。", type: "color", defaultValue: titleLayerDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "强调色", description: "编号、眉标题和边缘提示线的强调颜色。", type: "color", defaultValue: titleLayerDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "surface", label: "背景外观", description: "选择无背景、实色、玻璃或描边背景。", type: "select", defaultValue: titleLayerDefaults.surface, options: [{ value: "none", label: "无背景" }, { value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceColor", label: "背景颜色", description: "标题层背景的基础颜色。", type: "color", defaultValue: titleLayerDefaults.surfaceColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceOpacity", label: "背景透明度", description: "标题层背景的透明度。", type: "number", defaultValue: titleLayerDefaults.surfaceOpacity, min: 0.1, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边背景使用的边框颜色。", type: "color", defaultValue: titleLayerDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "背景边框的像素宽度。", type: "number", defaultValue: titleLayerDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "背景容器的圆角半径。", type: "number", defaultValue: titleLayerDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "背景渐变", description: "玻璃背景使用的可编辑渐变色标。", type: "gradient", defaultValue: titleLayerDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "标题层的入场、持续和出场阶段。", type: "animation-stage", defaultValue: titleLayerDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "concise-chapter",
      name: "简洁章节",
      description: "无背景的左侧章节层，突出清晰的信息层级。",
      visualDirection: "简洁信息",
      defaultParams: { surface: "none", alignment: "left", showSubtitle: true, accentColor: "#2dd4bf", stages: createStages({ enterDirection: "left", exitDirection: "right", sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.004 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.28, y: 0.28 }, size: { width: 0.52, height: 0.28 } }, "9:16": { position: { x: 0.5, y: 0.24 }, size: { width: 0.84, height: 0.24 } }, "1:1": { position: { x: 0.35, y: 0.28 }, size: { width: 0.7, height: 0.3 } } },
    },
    {
      id: "tech-numbered",
      name: "科技编号",
      description: "用等宽字体、玻璃底和向上进入的编号层建立数据感。",
      visualDirection: "科技数据",
      defaultParams: { surface: "glass", surfaceColor: "#0f172a", accentColor: "#38bdf8", font: "font.system-mono", alignment: "right", fontSize: 40, stages: createStages({ enterDirection: "up", exitDirection: "down", enterIntensity: 0.1, sustainDirection: "left", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.74, y: 0.27 }, size: { width: 0.48, height: 0.3 } }, "9:16": { position: { x: 0.5, y: 0.3 }, size: { width: 0.84, height: 0.28 } }, "1:1": { position: { x: 0.65, y: 0.3 }, size: { width: 0.68, height: 0.3 } } },
    },
    {
      id: "energetic-heading",
      name: "活力大标题",
      description: "用大字号、居中排版和高亮背景制造社媒节奏。",
      visualDirection: "活力社媒",
      defaultParams: { surface: "solid", surfaceColor: "#7c3aed", surfaceOpacity: 0.92, accentColor: "#fbbf24", alignment: "center", fontSize: 54, showSubtitle: false, radius: 28, stages: createStages({ enterDirection: "right", exitDirection: "left", enterIntensity: 0.12, sustainDirection: "right", sustainEasing: "ease-in-out", sustainIntensity: 0.006 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.68 }, size: { width: 0.7, height: 0.24 } }, "9:16": { position: { x: 0.5, y: 0.56 }, size: { width: 0.88, height: 0.22 } }, "1:1": { position: { x: 0.5, y: 0.64 }, size: { width: 0.82, height: 0.24 } } },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <TitleLayer {...props} />,
});

export type EmphasisCardParams = {
  label: string;
  text: string;
  icon: string;
  showLabel: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  font: string;
  fontSize: number;
  fontWeight: "500" | "600" | "700" | "800";
  textColor: string;
  accentColor: string;
  cardAppearance: SurfaceAppearance;
  cardColor: string;
  cardOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  spacing: { top: number; right: number; bottom: number; left: number };
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const emphasisCardDefaults: EmphasisCardParams = {
  label: "重点观点",
  text: "把复杂内容压缩成一句可以记住的话",
  icon: "icon.check",
  showLabel: true,
  position: { x: 0.5, y: 0.68 },
  size: { width: 0.68, height: 0.2 },
  alignment: "left",
  font: "font.system-sans",
  fontSize: 38,
  fontWeight: "700",
  textColor: "#f8fafc",
  accentColor: "#fbbf24",
  cardAppearance: "solid",
  cardColor: "#111827",
  cardOpacity: 0.94,
  borderColor: "#fbbf24",
  borderWidth: 1,
  radius: 18,
  spacing: { top: 22, right: 28, bottom: 22, left: 28 },
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#111827" },
      { offset: 1, color: "#1e293b" },
    ],
  },
  stages: createStages({ enterDirection: "left", exitDirection: "right" }),
};

/** 中文注释：渲染重点卡片的标签、图标和观点正文，保持文字高度受卡片尺寸约束。 */
export const EmphasisCard: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...emphasisCardDefaults, ...params } as EmphasisCardParams;
  const cardWidth = Math.max(1, values.size.width * width);
  const cardHeight = Math.max(1, values.size.height * height);
  const content = getContentBox({ width: cardWidth, height: cardHeight, spacing: values.spacing });
  const motion = resolveMotion(values.stages, frame, durationInFrames, width, height);
  const surface = resolveSurfaceAppearance({
    appearance: values.cardAppearance,
    color: values.cardColor,
    opacity: values.cardOpacity,
    gradient: values.gradient,
    borderColor: values.borderColor,
    borderWidth: values.borderWidth,
  });
  const labelHeight = Math.max(1, content.height * 0.28);
  const textHeight = Math.max(1, content.height - labelHeight - 8);

  return (
    <div
      data-effect-family="emphasis-card"
      data-starting-style-id={startingStyleId}
      data-template-id="emphasis-card"
      style={{ height: cardHeight, left: values.position.x * width, opacity: motion.opacity, position: "absolute", top: values.position.y * height, transform: `translate(-50%, -50%) ${motion.transform}`, width: cardWidth }}
    >
      <EffectCard
        background={surface.background}
        borderColor={surface.borderColor}
        borderRadius={values.radius}
        borderWidth={surface.borderWidth}
        gradient={surface.gradient}
        shadow={surface.shadow}
        style={{ height: "100%", width: "100%" }}
      >
        <div style={{ boxSizing: "border-box", height: "100%", padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`, width: "100%" }}>
          {values.showLabel ? (
            <div style={{ alignItems: "center", display: "flex", gap: 9, height: labelHeight, justifyContent: values.alignment }}>
              <BuiltInAssetImage assetId={values.icon} style={{ height: 18, width: 18 }} />
              <ResponsiveText
                fontAssetId={values.font}
                fontSize={Math.max(12, values.fontSize * 0.42)}
                height={labelHeight}
                maxLines={1}
                maxWidth={content.width - 27}
                style={{ color: values.accentColor, fontWeight: 800, letterSpacing: 1.2, textAlign: values.alignment }}
                text={values.label}
                width={Math.max(1, content.width - 27)}
              />
            </div>
          ) : null}
          <ResponsiveText
            fontAssetId={values.font}
            fontSize={values.fontSize}
            height={textHeight}
            maxLines={3}
            maxWidth={content.width}
            style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
            text={values.text}
            width={content.width}
          />
        </div>
      </EffectCard>
    </div>
  );
};

EmphasisCard.definition = defineEffectFamily({
  id: "emphasis-card",
  version: 1,
  category: "information-overlay",
  name: "重点卡片",
  description: "用独立卡片突出知识讲解中的观点、提示和最终结论。",
  purposeTags: ["重点标注", "结论", "提示"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 120,
  parameters: [
    { key: "label", label: "卡片标签", description: "卡片顶部的短标签，用于补充观点类型。", type: "text", defaultValue: emphasisCardDefaults.label, maxLength: 32, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "text", label: "观点正文", description: "卡片中需要被观众记住的核心观点。", type: "multiline-text", defaultValue: emphasisCardDefaults.text, maxLength: 160, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "icon", label: "卡片图标", description: "卡片标签旁使用的内置图标素材槽位。", type: "icon", defaultValue: emphasisCardDefaults.icon, options: iconOptions, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "showLabel", label: "显示卡片标签", description: "控制顶部标签行是否参与卡片布局。", type: "boolean", defaultValue: emphasisCardDefaults.showLabel, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "position", label: "位置", description: "卡片中心点在画布中的安全位置。", type: "position", defaultValue: emphasisCardDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "卡片在画布中的宽高比例。", type: "size", defaultValue: emphasisCardDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "标签和观点正文的水平对齐方式。", type: "select", defaultValue: emphasisCardDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "卡片内容与四条边界之间的间距。", type: "spacing", defaultValue: emphasisCardDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "卡片文字使用的内置字体素材槽位。", type: "font", defaultValue: emphasisCardDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "观点正文请求字号，长文本会按可用空间适配。", type: "number", defaultValue: emphasisCardDefaults.fontSize, min: 16, max: 84, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "观点正文的内置字体字重。", type: "select", defaultValue: emphasisCardDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "正文颜色", description: "观点正文的文字颜色。", type: "color", defaultValue: emphasisCardDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "强调色", description: "卡片标签和图标的强调颜色。", type: "color", defaultValue: emphasisCardDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "cardAppearance", label: "卡片外观", description: "选择实色、玻璃或描边卡片。", type: "select", defaultValue: emphasisCardDefaults.cardAppearance, options: [{ value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "cardColor", label: "卡片颜色", description: "卡片背景的基础颜色。", type: "color", defaultValue: emphasisCardDefaults.cardColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "cardOpacity", label: "卡片透明度", description: "卡片背景的透明度。", type: "number", defaultValue: emphasisCardDefaults.cardOpacity, min: 0.35, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边卡片使用的边框颜色。", type: "color", defaultValue: emphasisCardDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "卡片边框的像素宽度。", type: "number", defaultValue: emphasisCardDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "卡片容器的圆角半径。", type: "number", defaultValue: emphasisCardDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "卡片渐变", description: "玻璃卡片使用的可编辑渐变色标。", type: "gradient", defaultValue: emphasisCardDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "卡片的入场、持续和出场阶段。", type: "animation-stage", defaultValue: emphasisCardDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "solid-card",
      name: "实色卡片",
      description: "高对比实色底的重点观点卡片。",
      visualDirection: "简洁信息",
      defaultParams: { cardAppearance: "solid", cardColor: "#111827", cardOpacity: 0.94, accentColor: "#fbbf24", fontSize: 38, radius: 18, alignment: "left", stages: createStages({ enterDirection: "left", exitDirection: "right", sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.68 }, size: { width: 0.68, height: 0.2 } }, "9:16": { position: { x: 0.5, y: 0.64 }, size: { width: 0.86, height: 0.2 } }, "1:1": { position: { x: 0.5, y: 0.68 }, size: { width: 0.82, height: 0.22 } } },
    },
    {
      id: "glass-card",
      name: "玻璃卡片",
      description: "半透明渐变和柔和阴影构成的玻璃观点卡片。",
      visualDirection: "科技数据",
      defaultParams: { cardAppearance: "glass", cardColor: "#0f172a", cardOpacity: 0.78, borderColor: "#38bdf8", accentColor: "#38bdf8", font: "font.system-mono", radius: 22, stages: createStages({ enterDirection: "up", exitDirection: "down", enterIntensity: 0.1, sustainDirection: "left", sustainIntensity: 0.004 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.68, y: 0.62 }, size: { width: 0.56, height: 0.24 } }, "9:16": { position: { x: 0.5, y: 0.62 }, size: { width: 0.88, height: 0.22 } }, "1:1": { position: { x: 0.55, y: 0.64 }, size: { width: 0.84, height: 0.24 } } },
    },
    {
      id: "outline-card",
      name: "描边卡片",
      description: "留出视频画面的描边观点卡片，适合轻量结论提示。",
      visualDirection: "活力社媒",
      defaultParams: { cardAppearance: "outline", cardColor: "#7c3aed", cardOpacity: 0.84, borderColor: "#f472b6", borderWidth: 2, accentColor: "#f472b6", alignment: "center", radius: 28, showLabel: false, stages: createStages({ enterDirection: "right", exitDirection: "left", enterIntensity: 0.12, sustainDirection: "right", sustainIntensity: 0.005 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.76 }, size: { width: 0.74, height: 0.18 } }, "9:16": { position: { x: 0.5, y: 0.72 }, size: { width: 0.9, height: 0.2 } }, "1:1": { position: { x: 0.5, y: 0.72 }, size: { width: 0.86, height: 0.2 } } },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <EmphasisCard {...props} />,
});

export type QuoteCommentParams = {
  author: string;
  body: string;
  source: string;
  avatarIcon: string;
  quoteMark: "quote" | "chat" | "bubble";
  showSource: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  font: string;
  fontSize: number;
  fontWeight: "500" | "600" | "700" | "800";
  textColor: string;
  mutedColor: string;
  accentColor: string;
  panelAppearance: SurfaceAppearance;
  panelColor: string;
  panelOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  spacing: { top: number; right: number; bottom: number; left: number };
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const quoteCommentDefaults: QuoteCommentParams = {
  author: "一位读者",
  body: "真正有价值的内容，应该让复杂问题变得更容易理解。",
  source: "知识讲解评论",
  avatarIcon: "icon.check",
  quoteMark: "quote",
  showSource: true,
  position: { x: 0.5, y: 0.42 },
  size: { width: 0.62, height: 0.28 },
  alignment: "left",
  font: "font.system-sans",
  fontSize: 30,
  fontWeight: "600",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  accentColor: "#a78bfa",
  panelAppearance: "glass",
  panelColor: "#0f172a",
  panelOpacity: 0.82,
  borderColor: "#a78bfa",
  borderWidth: 1,
  radius: 22,
  spacing: { top: 24, right: 26, bottom: 22, left: 26 },
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#0f172a" },
      { offset: 1, color: "#312e81" },
    ],
  },
  stages: createStages({ enterDirection: "up", exitDirection: "down" }),
};

/** 中文注释：把引用、评论和对话三种标记转换为稳定的短视觉符号，避免引入未审核的外部图标资源。 */
function getQuoteMark(mark: QuoteCommentParams["quoteMark"]): string {
  if (mark === "chat") return "CHAT";
  if (mark === "bubble") return "•";
  return "“";
}

/** 中文注释：渲染引用与评论面板，正文和来源均在声明尺寸内响应式排版，不依赖真实 DOM 测量。 */
export const QuoteComment: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...quoteCommentDefaults, ...params } as QuoteCommentParams;
  const panelWidth = Math.max(1, values.size.width * width);
  const panelHeight = Math.max(1, values.size.height * height);
  const content = getContentBox({ width: panelWidth, height: panelHeight, spacing: values.spacing });
  const motion = resolveMotion(values.stages, frame, durationInFrames, width, height);
  const surface = resolveSurfaceAppearance({
    appearance: values.panelAppearance,
    color: values.panelColor,
    opacity: values.panelOpacity,
    gradient: values.gradient,
    borderColor: values.borderColor,
    borderWidth: values.borderWidth,
  });
  const authorHeight = Math.max(1, content.height * 0.24);
  const bodyHeight = Math.max(1, content.height * (values.showSource ? 0.52 : 0.7));

  return (
    <div
      data-effect-family="quote-comment"
      data-starting-style-id={startingStyleId}
      data-template-id="quote-comment"
      style={{ height: panelHeight, left: values.position.x * width, opacity: motion.opacity, position: "absolute", top: values.position.y * height, transform: `translate(-50%, -50%) ${motion.transform}`, width: panelWidth }}
    >
      <EffectCard
        background={surface.background}
        borderColor={surface.borderColor}
        borderRadius={values.radius}
        borderWidth={surface.borderWidth}
        gradient={surface.gradient}
        shadow={surface.shadow}
        style={{ height: "100%", width: "100%" }}
      >
        <div style={{ boxSizing: "border-box", height: "100%", padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`, width: "100%" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 10, height: authorHeight, justifyContent: values.alignment }}>
            <span style={{ alignItems: "center", backgroundColor: withAlpha(values.accentColor, 0.18), borderRadius: "50%", display: "inline-flex", flex: "0 0 auto", height: 30, justifyContent: "center", width: 30 }}>
              <BuiltInAssetImage assetId={values.avatarIcon} style={{ height: 16, width: 16 }} />
            </span>
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(12, values.fontSize * 0.5)}
              height={authorHeight}
              maxLines={1}
              maxWidth={content.width - 40}
              style={{ color: values.mutedColor, fontWeight: 700, textAlign: values.alignment }}
              text={values.author}
              width={Math.max(1, content.width - 40)}
            />
          </div>
          <div style={{ alignItems: values.alignment === "center" ? "center" : values.alignment === "right" ? "flex-end" : "flex-start", display: "flex", gap: 12, height: bodyHeight }}>
            <span style={{ color: values.accentColor, flex: "0 0 auto", fontFamily: "Georgia, serif", fontSize: Math.max(22, values.fontSize * 1.1), fontWeight: 800, lineHeight: 1 }}>{getQuoteMark(values.quoteMark)}</span>
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={values.fontSize}
              height={bodyHeight}
              maxLines={4}
              maxWidth={content.width - 42}
              style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
              text={values.body}
              width={Math.max(1, content.width - 42)}
            />
          </div>
          {values.showSource && values.source ? (
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(11, values.fontSize * 0.4)}
              height={Math.max(1, content.height - authorHeight - bodyHeight - 8)}
              maxLines={1}
              maxWidth={content.width}
              style={{ color: values.accentColor, fontWeight: 700, marginTop: 8, textAlign: values.alignment }}
              text={values.source}
              width={content.width}
            />
          ) : null}
        </div>
      </EffectCard>
    </div>
  );
};

QuoteComment.definition = defineEffectFamily({
  id: "quote-comment",
  version: 1,
  category: "information-overlay",
  name: "引用与评论",
  description: "以引用卡、评论卡和对话气泡呈现观点来源与观众反馈。",
  purposeTags: ["引用", "评论", "对话"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 132,
  parameters: [
    { key: "author", label: "作者或发送者", description: "引用作者、评论者或对话发送者名称。", type: "text", defaultValue: quoteCommentDefaults.author, maxLength: 48, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "body", label: "引用或评论正文", description: "需要呈现的引用、评论或消息内容。", type: "multiline-text", defaultValue: quoteCommentDefaults.body, maxLength: 220, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "source", label: "来源说明", description: "正文下方的来源、时间或上下文说明。", type: "text", defaultValue: quoteCommentDefaults.source, maxLength: 64, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "avatarIcon", label: "头像图标", description: "作者或发送者头像位置使用的内置图标。", type: "icon", defaultValue: quoteCommentDefaults.avatarIcon, options: iconOptions, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "showSource", label: "显示来源", description: "控制来源说明是否显示在正文下方。", type: "boolean", defaultValue: quoteCommentDefaults.showSource, group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "position", label: "位置", description: "面板中心点在画布中的安全位置。", type: "position", defaultValue: quoteCommentDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "面板在画布中的宽高比例。", type: "size", defaultValue: quoteCommentDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "作者、正文和来源的水平对齐方式。", type: "select", defaultValue: quoteCommentDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "面板内容与四边之间的间距。", type: "spacing", defaultValue: quoteCommentDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "引用或评论文字使用的内置字体。", type: "font", defaultValue: quoteCommentDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "正文请求字号，长内容会在面板内自适应。", type: "number", defaultValue: quoteCommentDefaults.fontSize, min: 14, max: 72, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "正文使用的内置字体字重。", type: "select", defaultValue: quoteCommentDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "正文颜色", description: "引用或评论正文颜色。", type: "color", defaultValue: quoteCommentDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "辅助文字颜色", description: "作者和来源文字颜色。", type: "color", defaultValue: quoteCommentDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "强调色", description: "头像、引用标记和来源说明的强调颜色。", type: "color", defaultValue: quoteCommentDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "quoteMark", label: "信息标记", description: "在正文旁显示引用、聊天或气泡标记。", type: "select", defaultValue: quoteCommentDefaults.quoteMark, options: [{ value: "quote", label: "引用符号" }, { value: "chat", label: "聊天标记" }, { value: "bubble", label: "气泡标记" }], group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "panelAppearance", label: "面板外观", description: "选择实色、玻璃、描边或无背景面板。", type: "select", defaultValue: quoteCommentDefaults.panelAppearance, options: [{ value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }, { value: "none", label: "无背景" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "panelColor", label: "面板颜色", description: "评论或引用面板的基础颜色。", type: "color", defaultValue: quoteCommentDefaults.panelColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "panelOpacity", label: "面板透明度", description: "面板背景的透明度。", type: "number", defaultValue: quoteCommentDefaults.panelOpacity, min: 0.3, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边面板的边框颜色。", type: "color", defaultValue: quoteCommentDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "面板边框的像素宽度。", type: "number", defaultValue: quoteCommentDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "面板容器的圆角半径。", type: "number", defaultValue: quoteCommentDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "面板渐变", description: "玻璃面板使用的可编辑渐变色标。", type: "gradient", defaultValue: quoteCommentDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "面板的入场、持续和出场阶段。", type: "animation-stage", defaultValue: quoteCommentDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "quote-card",
      name: "引用卡",
      description: "用大引用符号和来源说明建立有出处的观点卡。",
      visualDirection: "简洁信息",
      defaultParams: { quoteMark: "quote", panelAppearance: "solid", panelColor: "#1e293b", accentColor: "#fbbf24", alignment: "left", showSource: true, stages: createStages({ enterDirection: "left", exitDirection: "right", sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.42 }, size: { width: 0.62, height: 0.28 } }, "9:16": { position: { x: 0.5, y: 0.4 }, size: { width: 0.86, height: 0.28 } }, "1:1": { position: { x: 0.5, y: 0.44 }, size: { width: 0.82, height: 0.28 } } },
    },
    {
      id: "comment-card",
      name: "评论卡",
      description: "用头像、作者和半透明面板呈现观众评论。",
      visualDirection: "活力社媒",
      defaultParams: { quoteMark: "chat", panelAppearance: "glass", panelColor: "#0f172a", accentColor: "#2dd4bf", fontSize: 28, radius: 18, stages: createStages({ enterDirection: "right", exitDirection: "left", enterIntensity: 0.1, sustainDirection: "right", sustainIntensity: 0.004 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.72, y: 0.38 }, size: { width: 0.48, height: 0.3 } }, "9:16": { position: { x: 0.5, y: 0.42 }, size: { width: 0.88, height: 0.3 } }, "1:1": { position: { x: 0.58, y: 0.42 }, size: { width: 0.82, height: 0.3 } } },
    },
    {
      id: "chat-bubble",
      name: "对话气泡",
      description: "用圆润外形和轻量标记模拟对话中的消息气泡。",
      visualDirection: "科技数据",
      defaultParams: { quoteMark: "bubble", panelAppearance: "outline", panelColor: "#0f172a", borderColor: "#38bdf8", accentColor: "#38bdf8", radius: 32, showSource: false, alignment: "center", stages: createStages({ enterDirection: "up", exitDirection: "down", enterIntensity: 0.12, sustainDirection: "down", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.76 }, size: { width: 0.56, height: 0.2 } }, "9:16": { position: { x: 0.5, y: 0.7 }, size: { width: 0.86, height: 0.24 } }, "1:1": { position: { x: 0.5, y: 0.72 }, size: { width: 0.8, height: 0.24 } } },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <QuoteComment {...props} />,
});

type TagStatusItem = {
  label: string;
  value: string;
  icon: string;
  accentColor: string;
};

export type TagStatusParams = {
  title: string;
  items: TagStatusItem[];
  showTitle: boolean;
  showValues: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layoutMode: "wrap" | "stack" | "row";
  alignment: TextAlignment;
  font: string;
  fontSize: number;
  fontWeight: "500" | "600" | "700" | "800";
  textColor: string;
  mutedColor: string;
  accentColor: string;
  surfaceAppearance: SurfaceAppearance;
  surfaceColor: string;
  surfaceOpacity: number;
  pillColor: string;
  pillOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  spacing: { top: number; right: number; bottom: number; left: number };
  itemGap: number;
  stages: AnimationStageValue;
};

const tagStatusItems: TagStatusItem[] = [
  { label: "清晰表达", value: "重点", icon: "icon.check", accentColor: "#2dd4bf" },
  { label: "结构化", value: "步骤", icon: "icon.check", accentColor: "#38bdf8" },
  { label: "可复用", value: "模板", icon: "icon.check", accentColor: "#fbbf24" },
];

const tagStatusDefaults: TagStatusParams = {
  title: "本期关键词",
  items: tagStatusItems,
  showTitle: true,
  showValues: true,
  position: { x: 0.5, y: 0.3 },
  size: { width: 0.64, height: 0.2 },
  layoutMode: "wrap",
  alignment: "left",
  font: "font.system-sans",
  fontSize: 24,
  fontWeight: "700",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  accentColor: "#2dd4bf",
  surfaceAppearance: "none",
  surfaceColor: "#0f172a",
  surfaceOpacity: 0.84,
  pillColor: "#0f172a",
  pillOpacity: 0.78,
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 18,
  spacing: { top: 18, right: 20, bottom: 18, left: 20 },
  itemGap: 8,
  stages: createStages({ enterDirection: "up", exitDirection: "down", stagger: 4 }),
};

/** 中文注释：把结构化标签条目裁切到渲染安全上限，异常输入只减少当前绘制负载，不改变持久化数组。 */
function resolveTagItems(value: unknown): TagStatusItem[] {
  if (!Array.isArray(value)) return tagStatusItems;
  return value.slice(0, 8).filter((item): item is TagStatusItem => (
    typeof item === "object" && item !== null &&
    typeof (item as TagStatusItem).label === "string" &&
    typeof (item as TagStatusItem).value === "string" &&
    typeof (item as TagStatusItem).icon === "string" &&
    typeof (item as TagStatusItem).accentColor === "string"
  ));
}

/** 中文注释：按标签布局模式输出稳定的 CSS 网格，横屏、竖屏和方形只改变族级尺寸与列数。 */
function getTagLayout(input: {
  mode: TagStatusParams["layoutMode"];
  itemCount: number;
  gap: number;
}): { display: "flex" | "grid"; flexWrap?: "wrap"; gap: number; gridTemplateColumns?: string } {
  if (input.mode === "stack") {
    return { display: "grid", gap: input.gap, gridTemplateColumns: "minmax(0, 1fr)" };
  }
  if (input.mode === "row") {
    return { display: "grid", gap: input.gap, gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, input.itemCount))}, minmax(0, 1fr))` };
  }
  return { display: "flex", flexWrap: "wrap", gap: input.gap };
}

/** 中文注释：渲染标签、状态徽章和标签云，编辑器传入的内容始终作为结构化数组消费。 */
export const TagStatus: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...tagStatusDefaults, ...params } as TagStatusParams;
  const items = resolveTagItems(values.items);
  const containerWidth = Math.max(1, values.size.width * width);
  const containerHeight = Math.max(1, values.size.height * height);
  const content = getContentBox({ width: containerWidth, height: containerHeight, spacing: values.spacing });
  const motion = resolveMotion(values.stages, frame, durationInFrames, width, height);
  const surface = resolveSurfaceAppearance({
    appearance: values.surfaceAppearance,
    color: values.surfaceColor,
    opacity: values.surfaceOpacity,
    gradient: {
      angle: 135,
      stops: [
        { offset: 0, color: values.surfaceColor },
        { offset: 1, color: values.accentColor },
      ],
    },
    borderColor: values.borderColor,
    borderWidth: values.borderWidth,
  });
  const titleHeight = values.showTitle ? Math.max(1, values.fontSize * 1.6) : 0;
  const tagHeight = Math.max(1, content.height - titleHeight);
  const layout = getTagLayout({ mode: values.layoutMode, itemCount: items.length, gap: values.itemGap });

  return (
    <div
      data-effect-family="tag-status"
      data-starting-style-id={startingStyleId}
      data-template-id="tag-status"
      style={{ height: containerHeight, left: values.position.x * width, opacity: motion.opacity, position: "absolute", top: values.position.y * height, transform: `translate(-50%, -50%) ${motion.transform}`, width: containerWidth }}
    >
      <EffectCard
        background={surface.background}
        borderColor={surface.borderColor}
        borderRadius={values.radius}
        borderWidth={surface.borderWidth}
        // 中文注释：标签族的渐变由当前表面参数计算，必须传入卡片原语才能让玻璃样式真正生效。
        gradient={surface.gradient}
        shadow={surface.shadow}
        style={{ height: "100%", width: "100%" }}
      >
        <div style={{ boxSizing: "border-box", height: "100%", padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`, width: "100%" }}>
          {values.showTitle ? (
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(12, values.fontSize * 0.7)}
              height={titleHeight}
              maxLines={1}
              maxWidth={content.width}
              style={{ color: values.mutedColor, fontWeight: 700, textAlign: values.alignment }}
              text={values.title}
              width={content.width}
            />
          ) : null}
          <div style={{ alignContent: "flex-start", alignItems: "stretch", height: tagHeight, justifyContent: values.alignment, ...layout }}>
            {items.map((item, index) => {
              const itemMotion = resolveMotion(values.stages, frame, durationInFrames, width, height, index);
              return (
                <div
                  data-tag-status-item-index={index}
                  key={`${item.label}-${index}`}
                  style={{ alignItems: "center", backgroundColor: withAlpha(values.pillColor, values.pillOpacity), border: `${values.borderWidth}px solid ${withAlpha(item.accentColor || values.borderColor, 0.72)}`, borderRadius: values.radius, boxSizing: "border-box", display: "flex", gap: 7, minHeight: Math.max(30, values.fontSize * 1.7), opacity: itemMotion.opacity, overflow: "hidden", padding: "7px 10px", transform: itemMotion.transform, width: values.layoutMode === "stack" ? "100%" : undefined }}
                >
                  <BuiltInAssetImage assetId={item.icon} style={{ flex: "0 0 auto", height: Math.max(14, values.fontSize * 0.56), width: Math.max(14, values.fontSize * 0.56) }} />
                  <ResponsiveText
                    fontAssetId={values.font}
                    fontSize={values.fontSize}
                    height={Math.max(1, values.fontSize * 1.7)}
                    maxLines={2}
                    maxWidth={Math.max(1, content.width - values.fontSize * 0.56 - 30)}
                    style={{ color: values.textColor, flex: "1 1 auto", fontWeight: values.fontWeight, textAlign: values.alignment }}
                    text={values.showValues && item.value ? `${item.label} · ${item.value}` : item.label}
                    width={Math.max(1, content.width - values.fontSize * 0.56 - 30)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </EffectCard>
    </div>
  );
};

TagStatus.definition = defineEffectFamily({
  id: "tag-status",
  version: 1,
  category: "information-overlay",
  name: "标签与状态",
  description: "用结构化标签、状态徽章和标签云补充知识内容的分类与状态。",
  purposeTags: ["标签", "状态", "分类"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 108,
  parameters: [
    { key: "title", label: "标签标题", description: "标签组上方用于说明语义范围的短标题。", type: "text", defaultValue: tagStatusDefaults.title, maxLength: 40, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "items", label: "标签条目", description: "每个条目独立保存标签、状态值、图标和强调色。", type: "structured-list", defaultValue: tagStatusDefaults.items, itemSchema: [{ key: "label", label: "标签文本", description: "标签主体文字。", type: "text", defaultValue: "新标签", maxLength: 28 }, { key: "value", label: "状态值", description: "可选的状态、分类或补充信息。", type: "text", defaultValue: "", maxLength: 20 }, { key: "icon", label: "图标", description: "标签条目使用的内置图标。", type: "icon", defaultValue: "icon.check", options: iconOptions }, { key: "accentColor", label: "强调色", description: "当前条目边框和状态颜色。", type: "color", defaultValue: "#2dd4bf" }], minItems: 1, maxItems: 8, allowReordering: true, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "showTitle", label: "显示标签标题", description: "控制标签组标题是否占用布局空间。", type: "boolean", defaultValue: tagStatusDefaults.showTitle, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "showValues", label: "显示状态值", description: "控制每个条目的补充状态值是否显示。", type: "boolean", defaultValue: tagStatusDefaults.showValues, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "position", label: "位置", description: "标签组中心点在画布中的安全位置。", type: "position", defaultValue: tagStatusDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "标签组在画布中的宽高比例。", type: "size", defaultValue: tagStatusDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "layoutMode", label: "排列方式", description: "选择自动换行、纵向堆叠或横向并列。", type: "select", defaultValue: tagStatusDefaults.layoutMode, options: [{ value: "wrap", label: "自动换行" }, { value: "stack", label: "纵向堆叠" }, { value: "row", label: "横向并列" }], group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "alignment", label: "对齐", description: "标签文本和标签组的水平对齐方式。", type: "select", defaultValue: tagStatusDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "标签组内容与四边之间的间距。", type: "spacing", defaultValue: tagStatusDefaults.spacing, min: 0, max: 64, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "itemGap", label: "条目间距", description: "多个标签条目之间的间距。", type: "number", defaultValue: tagStatusDefaults.itemGap, min: 0, max: 32, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "标签文字使用的内置字体素材槽位。", type: "font", defaultValue: tagStatusDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "标签文字请求字号，长标签会在条目内自适应。", type: "number", defaultValue: tagStatusDefaults.fontSize, min: 12, max: 54, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "标签文字的内置字体字重。", type: "select", defaultValue: tagStatusDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "标签颜色", description: "标签主体文字颜色。", type: "color", defaultValue: tagStatusDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "标题颜色", description: "标签组标题的辅助颜色。", type: "color", defaultValue: tagStatusDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "默认强调色", description: "没有单独条目颜色时使用的默认强调色。", type: "color", defaultValue: tagStatusDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "surfaceAppearance", label: "容器外观", description: "选择无背景、实色、玻璃或描边容器。", type: "select", defaultValue: tagStatusDefaults.surfaceAppearance, options: [{ value: "none", label: "无背景" }, { value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceColor", label: "容器颜色", description: "标签组容器的基础颜色。", type: "color", defaultValue: tagStatusDefaults.surfaceColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceOpacity", label: "容器透明度", description: "标签组容器的背景透明度。", type: "number", defaultValue: tagStatusDefaults.surfaceOpacity, min: 0.2, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "pillColor", label: "标签底色", description: "单个标签胶囊的基础背景色。", type: "color", defaultValue: tagStatusDefaults.pillColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "pillOpacity", label: "标签透明度", description: "单个标签胶囊的背景透明度。", type: "number", defaultValue: tagStatusDefaults.pillOpacity, min: 0.2, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "标签组和标签条目的边框颜色。", type: "color", defaultValue: tagStatusDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "标签边框的像素宽度。", type: "number", defaultValue: tagStatusDefaults.borderWidth, min: 0, max: 6, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "标签条目的圆角半径。", type: "number", defaultValue: tagStatusDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "标签组和逐项条目的入场、持续和出场阶段。", type: "animation-stage", defaultValue: tagStatusDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "tag-capsules",
      name: "标签胶囊",
      description: "用自动换行的彩色胶囊呈现多个主题标签。",
      visualDirection: "简洁信息",
      defaultParams: { layoutMode: "wrap", showTitle: true, showValues: false, surfaceAppearance: "none", pillColor: "#0f172a", accentColor: "#2dd4bf", radius: 20, stages: createStages({ enterDirection: "up", exitDirection: "down", stagger: 4, sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.32, y: 0.28 }, size: { width: 0.56, height: 0.2 } }, "9:16": { position: { x: 0.5, y: 0.26 }, size: { width: 0.86, height: 0.22 } }, "1:1": { position: { x: 0.38, y: 0.28 }, size: { width: 0.76, height: 0.22 } } },
    },
    {
      id: "status-badges",
      name: "状态徽章",
      description: "用横向并列的状态值快速表达当前进度和分类。",
      visualDirection: "科技数据",
      defaultParams: { layoutMode: "row", showTitle: false, showValues: true, surfaceAppearance: "glass", surfaceColor: "#0f172a", accentColor: "#38bdf8", font: "font.system-mono", radius: 10, stages: createStages({ enterDirection: "right", exitDirection: "left", stagger: 3, sustainDirection: "right", sustainIntensity: 0.002 }) },
      aspectRatioDefaults: { "16:9": { position: { x: 0.5, y: 0.78 }, size: { width: 0.72, height: 0.14 } }, "9:16": { position: { x: 0.5, y: 0.72 }, size: { width: 0.9, height: 0.22 } }, "1:1": { position: { x: 0.5, y: 0.76 }, size: { width: 0.86, height: 0.18 } } },
    },
    {
      id: "tag-cloud",
      name: "标签云",
      description: "用较大的间距和轻量容器组织关键词、分类和补充状态。",
      visualDirection: "活力社媒",
      defaultParams: { layoutMode: "wrap", showTitle: true, showValues: true, surfaceAppearance: "outline", surfaceColor: "#7c3aed", borderColor: "#f472b6", accentColor: "#f472b6", fontSize: 28, itemGap: 14, radius: 28, stages: createStages({ enterDirection: "left", exitDirection: "right", stagger: 5, sustainDirection: "left", sustainEasing: "ease-in-out", sustainIntensity: 0.004 }) },
      parameterConstraints: { items: { maxItems: 6 } },
      aspectRatioDefaults: { "16:9": { position: { x: 0.68, y: 0.3 }, size: { width: 0.56, height: 0.24 } }, "9:16": { position: { x: 0.5, y: 0.3 }, size: { width: 0.88, height: 0.3 } }, "1:1": { position: { x: 0.58, y: 0.32 }, size: { width: 0.84, height: 0.28 } } },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <TagStatus {...props} />,
});
