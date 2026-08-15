import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  GradientValue,
} from "../../domain/templates/types";
import { BuiltInAssetImage, EffectCard, ResponsiveText, withAlpha } from "./primitives";
import {
  createStages,
  fontOptions,
  getContentBox,
  iconOptions,
  resolveMotion,
  resolveSurfaceAppearance,
  type SurfaceAppearance,
  type TextAlignment,
} from "./information-family-helpers";

type FontWeight = "500" | "600" | "700" | "800";

/** 中文注释：下三分之一信息条的内容覆盖人物身份、名词解释和信息来源三种语义。 */
export type LowerThirdParams = {
  eyebrow: string;
  title: string;
  subtitle: string;
  source: string;
  showSubtitle: boolean;
  showSource: boolean;
  showIcon: boolean;
  icon: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  spacing: { top: number; right: number; bottom: number; left: number };
  font: string;
  fontSize: number;
  fontWeight: FontWeight;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  surface: SurfaceAppearance;
  surfaceColor: string;
  surfaceOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const lowerThirdDefaults: LowerThirdParams = {
  eyebrow: "主讲人",
  title: "周芷若",
  subtitle: "产品研究与内容策划",
  source: "",
  showSubtitle: true,
  showSource: false,
  showIcon: true,
  icon: "icon.check",
  position: { x: 0.22, y: 0.78 },
  size: { width: 0.48, height: 0.18 },
  alignment: "left",
  spacing: { top: 18, right: 24, bottom: 18, left: 24 },
  font: "font.system-sans",
  fontSize: 32,
  fontWeight: "700",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  accentColor: "#2dd4bf",
  surface: "solid",
  surfaceColor: "#111827",
  surfaceOpacity: 0.92,
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 14,
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#111827" },
      { offset: 1, color: "#1e293b" },
    ],
  },
  stages: createStages({ enterDirection: "left", exitDirection: "right" }),
};

/** 中文注释：把字符串和数值限制在渲染所需范围内，防止直接调用族 render 时生成非法 CSS。 */
function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 中文注释：渲染下三分之一信息条，样式差异由表面、字体、对齐和内容显隐参数共同构成。 */
export const LowerThird: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...lowerThirdDefaults, ...params } as LowerThirdParams;
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
  const iconWidth = values.showIcon ? 28 : 0;
  const textWidth = Math.max(1, content.width - iconWidth);
  const eyebrowHeight = Math.max(1, values.fontSize * 0.8);
  const titleHeight = Math.max(1, content.height * (values.showSubtitle ? 0.46 : 0.72));
  const subtitleHeight = Math.max(1, content.height - eyebrowHeight - titleHeight - (values.showSource ? 8 : 0));
  const sourceHeight = Math.max(1, values.fontSize * 0.58);
  const accentWidth = values.alignment === "center" ? "42%" : 4;
  const accentPosition = values.alignment === "right" ? { right: 0 } : { left: 0 };

  return (
    <div
      data-effect-family="lower-third"
      data-starting-style-id={startingStyleId}
      data-template-id="lower-third"
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
          data-lower-third-accent="true"
          style={{
            backgroundColor: values.accentColor,
            bottom: values.alignment === "center" ? 0 : 0,
            height: values.alignment === "center" ? 3 : "100%",
            position: "absolute",
            width: accentWidth,
            ...accentPosition,
          }}
        />
        <div
          style={{
            boxSizing: "border-box",
            height: "100%",
            padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`,
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 10, height: eyebrowHeight, justifyContent: values.alignment }}>
            {values.showIcon ? <BuiltInAssetImage assetId={values.icon} style={{ flex: "0 0 auto", height: 18, width: 18 }} /> : null}
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(11, values.fontSize * 0.42)}
              height={eyebrowHeight}
              maxLines={1}
              maxWidth={textWidth}
              style={{ color: values.accentColor, fontWeight: 800, letterSpacing: 1.2, textAlign: values.alignment }}
              text={values.eyebrow}
              width={textWidth}
            />
          </div>
          <ResponsiveText
            fontAssetId={values.font}
            fontSize={values.fontSize}
            height={titleHeight}
            maxLines={2}
            maxWidth={content.width}
            style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
            text={values.title}
            width={content.width}
          />
          {values.showSubtitle ? (
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(12, values.fontSize * 0.42)}
              height={subtitleHeight}
              maxLines={2}
              maxWidth={content.width}
              style={{ color: values.mutedColor, marginTop: 4, textAlign: values.alignment }}
              text={values.subtitle}
              width={content.width}
            />
          ) : null}
          {values.showSource ? (
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(10, values.fontSize * 0.34)}
              height={sourceHeight}
              maxLines={1}
              maxWidth={content.width}
              style={{ color: values.mutedColor, marginTop: 4, textAlign: values.alignment }}
              text={values.source}
              width={content.width}
            />
          ) : null}
        </div>
      </EffectCard>
    </div>
  );
};

LowerThird.definition = defineEffectFamily({
  id: "lower-third",
  version: 1,
  category: "information-overlay",
  name: "下三分之一信息条",
  description: "用人物、名词和来源信息建立画面下部的稳定说明层。",
  purposeTags: ["人物身份", "名词定义", "信息来源"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 120,
  parameters: [
    { key: "eyebrow", label: "眉标题", description: "信息条顶部的身份、类别或来源短标签。", type: "text", defaultValue: lowerThirdDefaults.eyebrow, maxLength: 36, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "title", label: "主标题", description: "人物姓名、名词或来源名称等核心内容。", type: "multiline-text", defaultValue: lowerThirdDefaults.title, maxLength: 80, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "subtitle", label: "补充说明", description: "人物职务、名词解释或来源补充说明。", type: "multiline-text", defaultValue: lowerThirdDefaults.subtitle, maxLength: 120, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "source", label: "来源文本", description: "信息来源样式使用的来源、日期或出处说明。", type: "text", defaultValue: lowerThirdDefaults.source, maxLength: 100, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "icon", label: "信息图标", description: "信息条使用的内置图标素材槽位。", type: "icon", defaultValue: lowerThirdDefaults.icon, options: iconOptions, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "showSubtitle", label: "显示补充说明", description: "控制补充说明是否占用信息条布局空间。", type: "boolean", defaultValue: lowerThirdDefaults.showSubtitle, group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "showSource", label: "显示来源文本", description: "控制来源、日期或出处说明是否显示。", type: "boolean", defaultValue: lowerThirdDefaults.showSource, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "showIcon", label: "显示信息图标", description: "控制眉标题旁的内置图标是否显示。", type: "boolean", defaultValue: lowerThirdDefaults.showIcon, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "position", label: "位置", description: "信息条中心点在画布中的安全位置。", type: "position", defaultValue: lowerThirdDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "信息条在画布中的宽高比例。", type: "size", defaultValue: lowerThirdDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "信息条文字和强调线的水平对齐方式。", type: "select", defaultValue: lowerThirdDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "信息条内容与边界之间的四边间距。", type: "spacing", defaultValue: lowerThirdDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "信息条文字使用的内置字体素材槽位。", type: "font", defaultValue: lowerThirdDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "信息条主标题请求字号，长文本会在安全区域内适配。", type: "number", defaultValue: lowerThirdDefaults.fontSize, min: 16, max: 72, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "信息条主标题的内置字体字重。", type: "select", defaultValue: lowerThirdDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "主标题颜色", description: "信息条主标题文字颜色。", type: "color", defaultValue: lowerThirdDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "辅助文字颜色", description: "眉标题、补充说明和来源文字颜色。", type: "color", defaultValue: lowerThirdDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "强调色", description: "眉标题、图标和信息条强调线颜色。", type: "color", defaultValue: lowerThirdDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "surface", label: "背景外观", description: "选择无背景、实色、玻璃或描边信息条。", type: "select", defaultValue: lowerThirdDefaults.surface, options: [{ value: "none", label: "无背景" }, { value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceColor", label: "背景颜色", description: "信息条背景的基础颜色。", type: "color", defaultValue: lowerThirdDefaults.surfaceColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceOpacity", label: "背景透明度", description: "信息条背景的透明度。", type: "number", defaultValue: lowerThirdDefaults.surfaceOpacity, min: 0.1, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边信息条使用的边框颜色。", type: "color", defaultValue: lowerThirdDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "信息条边框的像素宽度。", type: "number", defaultValue: lowerThirdDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "信息条背景容器的圆角半径。", type: "number", defaultValue: lowerThirdDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "背景渐变", description: "玻璃信息条使用的可编辑渐变色标。", type: "gradient", defaultValue: lowerThirdDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "信息条的入场、持续和出场阶段。", type: "animation-stage", defaultValue: lowerThirdDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "person-identity",
      name: "人物身份",
      description: "以稳定的左下信息条介绍主讲人、嘉宾或角色身份。",
      visualDirection: "简洁信息",
      defaultParams: { eyebrow: "主讲人", title: "周芷若", subtitle: "产品研究与内容策划", showIcon: true, surface: "solid", surfaceColor: "#111827", accentColor: "#2dd4bf", stages: createStages({ enterDirection: "left", exitDirection: "right", sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.28, y: 0.78 }, size: { width: 0.44, height: 0.18 } },
        "9:16": { position: { x: 0.5, y: 0.76 }, size: { width: 0.82, height: 0.18 } },
        "1:1": { position: { x: 0.38, y: 0.76 }, size: { width: 0.68, height: 0.2 } },
      },
    },
    {
      id: "term-definition",
      name: "名词定义",
      description: "以玻璃面板和等宽眉标题解释知识视频中的关键名词。",
      visualDirection: "科技数据",
      defaultParams: { eyebrow: "TERM / DEFINITION", title: "结构化内容", subtitle: "把复杂观点拆成可编辑的条目", showIcon: false, surface: "glass", surfaceColor: "#0f172a", font: "font.system-mono", fontSize: 30, alignment: "left", accentColor: "#38bdf8", stages: createStages({ enterDirection: "up", exitDirection: "down", enterIntensity: 0.1, sustainDirection: "left", sustainIntensity: 0.004 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.72 }, size: { width: 0.6, height: 0.2 } },
        "9:16": { position: { x: 0.5, y: 0.7 }, size: { width: 0.86, height: 0.2 } },
        "1:1": { position: { x: 0.5, y: 0.72 }, size: { width: 0.82, height: 0.22 } },
      },
    },
    {
      id: "source-attribution",
      name: "信息来源",
      description: "以右下描边信息条呈现报告、访谈或公开资料来源。",
      visualDirection: "活力社媒",
      defaultParams: { eyebrow: "SOURCE", title: "研究报告与公开数据", subtitle: "来源说明", source: "来源：公开资料与访谈", showSource: true, showIcon: true, surface: "outline", surfaceColor: "#0f172a", alignment: "right", fontSize: 28, accentColor: "#fb7185", borderColor: "#fb7185", radius: 24, stages: createStages({ enterDirection: "right", exitDirection: "left", enterIntensity: 0.12, sustainDirection: "right", sustainEasing: "ease-in-out", sustainIntensity: 0.005 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.72, y: 0.78 }, size: { width: 0.44, height: 0.2 } },
        "9:16": { position: { x: 0.5, y: 0.78 }, size: { width: 0.84, height: 0.22 } },
        "1:1": { position: { x: 0.62, y: 0.78 }, size: { width: 0.68, height: 0.22 } },
      },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <LowerThird {...props} />,
});

type TrendDirection = "up" | "down" | "steady";
type DataDisplayMode = "metric" | "progress";

/** 中文注释：数据与数字族把单个重点数字和进度指标统一为同一套可调参数语义。 */
export type DataNumberParams = {
  label: string;
  value: number;
  unit: string;
  caption: string;
  trendValue: string;
  trend: TrendDirection;
  showTrend: boolean;
  showProgress: boolean;
  showIcon: boolean;
  icon: string;
  displayMode: DataDisplayMode;
  maxValue: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  spacing: { top: number; right: number; bottom: number; left: number };
  font: string;
  fontSize: number;
  fontWeight: FontWeight;
  textColor: string;
  mutedColor: string;
  valueColor: string;
  accentColor: string;
  surface: SurfaceAppearance;
  surfaceColor: string;
  surfaceOpacity: number;
  progressColor: string;
  progressTrackColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const dataNumberDefaults: DataNumberParams = {
  label: "关键留存率",
  value: 86,
  unit: "%",
  caption: "较上一周期提升",
  trendValue: "+12%",
  trend: "up",
  showTrend: true,
  showProgress: false,
  showIcon: true,
  icon: "icon.check",
  displayMode: "metric",
  maxValue: 100,
  position: { x: 0.5, y: 0.62 },
  size: { width: 0.42, height: 0.28 },
  alignment: "left",
  spacing: { top: 22, right: 24, bottom: 22, left: 24 },
  font: "font.system-sans",
  fontSize: 66,
  fontWeight: "800",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  valueColor: "#2dd4bf",
  accentColor: "#38bdf8",
  surface: "solid",
  surfaceColor: "#111827",
  surfaceOpacity: 0.94,
  progressColor: "#2dd4bf",
  progressTrackColor: "#334155",
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 18,
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#111827" },
      { offset: 1, color: "#172554" },
    ],
  },
  stages: createStages({ enterDirection: "up", exitDirection: "down" }),
};

/** 中文注释：把趋势枚举转换成稳定的可读标记，避免渲染器依赖系统图标或随机内容。 */
function getTrendSymbol(trend: TrendDirection): string {
  if (trend === "down") return "↓";
  if (trend === "steady") return "→";
  return "↑";
}

/** 中文注释：渲染重点数字和进度指标，进度宽度只由数字和最大值确定并保持有限范围。 */
export const DataNumber: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...dataNumberDefaults, ...params } as DataNumberParams;
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
  const progress = clampFinite(values.value / Math.max(1, values.maxValue), 0, 1, 0);
  const progressVisible = values.showProgress || values.displayMode === "progress";
  const valueText = Number.isInteger(values.value) ? String(values.value) : values.value.toFixed(1);
  const valueWidth = Math.max(1, content.width * 0.74);
  const trendText = `${getTrendSymbol(values.trend)} ${values.trendValue}`;
  const iconSize = Math.max(14, values.fontSize * 0.28);

  return (
    <div
      data-effect-family="data-number"
      data-starting-style-id={startingStyleId}
      data-template-id="data-number"
      data-display-mode={values.displayMode}
      data-value={values.value}
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
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "space-between",
            padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`,
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 9, justifyContent: values.alignment }}>
            {values.showIcon ? <BuiltInAssetImage assetId={values.icon} style={{ height: iconSize, width: iconSize }} /> : null}
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(12, values.fontSize * 0.34)}
              height={Math.max(1, values.fontSize * 0.8)}
              maxLines={1}
              maxWidth={content.width}
              style={{ color: values.mutedColor, fontWeight: 700, letterSpacing: 1.1, textAlign: values.alignment }}
              text={values.label}
              width={content.width}
            />
          </div>
          <div style={{ alignItems: "baseline", display: "flex", gap: 8, justifyContent: values.alignment }}>
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={values.fontSize}
              height={Math.max(1, content.height * 0.48)}
              maxLines={1}
              maxWidth={valueWidth}
              style={{ color: values.valueColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
              text={valueText}
              width={valueWidth}
            />
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(14, values.fontSize * 0.36)}
              height={Math.max(1, values.fontSize * 0.55)}
              maxLines={1}
              maxWidth={Math.max(1, content.width - valueWidth)}
              style={{ color: values.textColor, fontWeight: 700, textAlign: values.alignment }}
              text={values.unit}
              width={Math.max(1, content.width - valueWidth)}
            />
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: values.alignment }}>
            <ResponsiveText
              fontAssetId={values.font}
              fontSize={Math.max(11, values.fontSize * 0.25)}
              height={Math.max(1, values.fontSize * 0.46)}
              maxLines={1}
              maxWidth={content.width}
              style={{ color: values.mutedColor, textAlign: values.alignment }}
              text={values.caption}
              width={content.width}
            />
            {values.showTrend ? (
              <span data-data-number-trend={values.trend} style={{ color: values.accentColor, fontSize: Math.max(12, values.fontSize * 0.26), fontWeight: 800, whiteSpace: "nowrap" }}>
                {trendText}
              </span>
            ) : null}
          </div>
          {progressVisible ? (
            <div data-data-number-progress="true" style={{ backgroundColor: values.progressTrackColor, borderRadius: 999, height: Math.max(5, values.fontSize * 0.09), overflow: "hidden", width: "100%" }}>
              <div style={{ backgroundColor: values.progressColor, borderRadius: 999, height: "100%", width: `${progress * 100}%` }} />
            </div>
          ) : (
            <div data-data-number-accent="true" style={{ backgroundColor: values.progressColor, height: Math.max(3, values.fontSize * 0.06), width: "100%" }} />
          )}
        </div>
      </EffectCard>
    </div>
  );
};

DataNumber.definition = defineEffectFamily({
  id: "data-number",
  version: 1,
  category: "information-overlay",
  name: "数据与数字",
  description: "用重点数字、趋势和进度条突出知识内容中的量化结论。",
  purposeTags: ["数字", "数据", "进度"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 120,
  parameters: [
    { key: "label", label: "指标标签", description: "说明当前数字代表什么指标或结论。", type: "text", defaultValue: dataNumberDefaults.label, maxLength: 40, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "value", label: "数字值", description: "需要突出显示的有限数字，进度样式会用它计算比例。", type: "number", defaultValue: dataNumberDefaults.value, min: 0, max: 1000, step: 1, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "unit", label: "数字单位", description: "数字后面的百分比、人数或其他单位文本。", type: "text", defaultValue: dataNumberDefaults.unit, maxLength: 12, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "caption", label: "指标说明", description: "解释数字上下文或比较基准的短说明。", type: "multiline-text", defaultValue: dataNumberDefaults.caption, maxLength: 80, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "trendValue", label: "趋势值", description: "趋势箭头旁显示的变化幅度或比较值。", type: "text", defaultValue: dataNumberDefaults.trendValue, maxLength: 20, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "icon", label: "指标图标", description: "指标标签旁使用的内置图标素材槽位。", type: "icon", defaultValue: dataNumberDefaults.icon, options: iconOptions, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "position", label: "位置", description: "数字卡片中心点在画布中的安全位置。", type: "position", defaultValue: dataNumberDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "数字卡片在画布中的宽高比例。", type: "size", defaultValue: dataNumberDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "指标标签、数字和说明的水平对齐方式。", type: "select", defaultValue: dataNumberDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "数字卡片内容与边界之间的四边间距。", type: "spacing", defaultValue: dataNumberDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "数字卡片文字使用的内置字体素材槽位。", type: "font", defaultValue: dataNumberDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "数字字号", description: "重点数字请求字号，画布比例和卡片高度会共同约束最终字号。", type: "number", defaultValue: dataNumberDefaults.fontSize, min: 24, max: 112, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "数字字重", description: "重点数字使用的内置字体字重。", type: "select", defaultValue: dataNumberDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "单位颜色", description: "单位和趋势上下文使用的文字颜色。", type: "color", defaultValue: dataNumberDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "辅助文字颜色", description: "指标标签和说明使用的辅助文字颜色。", type: "color", defaultValue: dataNumberDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "valueColor", label: "数字颜色", description: "重点数字本身的颜色。", type: "color", defaultValue: dataNumberDefaults.valueColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "accentColor", label: "趋势强调色", description: "趋势标记和指标强调线的颜色。", type: "color", defaultValue: dataNumberDefaults.accentColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surface", label: "背景外观", description: "选择无背景、实色、玻璃或描边数字卡片。", type: "select", defaultValue: dataNumberDefaults.surface, options: [{ value: "none", label: "无背景" }, { value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceColor", label: "背景颜色", description: "数字卡片背景的基础颜色。", type: "color", defaultValue: dataNumberDefaults.surfaceColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceOpacity", label: "背景透明度", description: "数字卡片背景的透明度。", type: "number", defaultValue: dataNumberDefaults.surfaceOpacity, min: 0.1, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "progressColor", label: "进度颜色", description: "进度条或数字卡底部强调线的颜色。", type: "color", defaultValue: dataNumberDefaults.progressColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "progressTrackColor", label: "进度轨道颜色", description: "进度条未完成部分的轨道颜色。", type: "color", defaultValue: dataNumberDefaults.progressTrackColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边数字卡片使用的边框颜色。", type: "color", defaultValue: dataNumberDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "数字卡片边框的像素宽度。", type: "number", defaultValue: dataNumberDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "数字卡片背景容器的圆角半径。", type: "number", defaultValue: dataNumberDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "背景渐变", description: "玻璃数字卡片使用的可编辑渐变色标。", type: "gradient", defaultValue: dataNumberDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "trend", label: "趋势方向", description: "趋势标记显示上升、下降或持平方向。", type: "select", defaultValue: dataNumberDefaults.trend, options: [{ value: "up", label: "上升" }, { value: "down", label: "下降" }, { value: "steady", label: "持平" }], group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "showTrend", label: "显示趋势", description: "控制数字下方的趋势标记是否显示。", type: "boolean", defaultValue: dataNumberDefaults.showTrend, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "showProgress", label: "显示进度条", description: "控制底部是否显示按数字计算的进度条。", type: "boolean", defaultValue: dataNumberDefaults.showProgress, group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "showIcon", label: "显示指标图标", description: "控制指标标签旁的内置图标是否显示。", type: "boolean", defaultValue: dataNumberDefaults.showIcon, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "displayMode", label: "数字表现方式", description: "选择单个数字指标或带比例轨道的进度表现。", type: "select", defaultValue: dataNumberDefaults.displayMode, options: [{ value: "metric", label: "重点数字" }, { value: "progress", label: "进度指标" }], group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "maxValue", label: "最大值", description: "进度模式用于计算完成比例的最大值。", type: "number", defaultValue: dataNumberDefaults.maxValue, min: 1, max: 1000, step: 1, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "数字卡片的入场、持续和出场阶段。", type: "animation-stage", defaultValue: dataNumberDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "key-metric",
      name: "重点数字",
      description: "以大字号数字、趋势标记和强调线突出一个量化结论。",
      visualDirection: "简洁信息",
      defaultParams: { label: "关键留存率", value: 86, unit: "%", caption: "较上一周期提升", trend: "up", trendValue: "+12%", showTrend: true, showProgress: false, displayMode: "metric", surface: "solid", surfaceColor: "#111827", valueColor: "#2dd4bf", stages: createStages({ enterDirection: "up", exitDirection: "down", sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.62 }, size: { width: 0.42, height: 0.28 } },
        "9:16": { position: { x: 0.5, y: 0.58 }, size: { width: 0.82, height: 0.26 } },
        "1:1": { position: { x: 0.5, y: 0.6 }, size: { width: 0.76, height: 0.3 } },
      },
    },
    {
      id: "progress-indicator",
      name: "进度指标",
      description: "以等宽数字、玻璃面板和进度轨道表达阶段完成度。",
      visualDirection: "科技数据",
      defaultParams: { label: "发布进度", value: 72, unit: "%", caption: "内容制作完成度", trend: "steady", trendValue: "阶段中", showTrend: false, showProgress: true, displayMode: "progress", surface: "glass", surfaceColor: "#0f172a", font: "font.system-mono", fontSize: 60, valueColor: "#38bdf8", progressColor: "#38bdf8", progressTrackColor: "#1e3a5f", borderColor: "#38bdf8", stages: createStages({ enterDirection: "left", exitDirection: "right", enterIntensity: 0.1, sustainDirection: "left", sustainIntensity: 0.004 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.72, y: 0.62 }, size: { width: 0.42, height: 0.28 } },
        "9:16": { position: { x: 0.5, y: 0.62 }, size: { width: 0.84, height: 0.28 } },
        "1:1": { position: { x: 0.62, y: 0.62 }, size: { width: 0.76, height: 0.3 } },
      },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <DataNumber {...props} />,
});

type ComparisonItem = {
  left: string;
  right: string;
  accentColor: string;
  icon: string;
};
type ComparisonLayout = "split" | "verdict";
type HighlightSide = "left" | "right" | "none";

/** 中文注释：对比与结论族用结构化条目同时承载左右差异和最终判断，避免把比较内容编码成分隔符文本。 */
export type ComparisonConclusionParams = {
  title: string;
  leftHeading: string;
  rightHeading: string;
  items: ComparisonItem[];
  conclusion: string;
  supportingText: string;
  showItems: boolean;
  showConclusion: boolean;
  layoutMode: ComparisonLayout;
  highlightSide: HighlightSide;
  position: { x: number; y: number };
  size: { width: number; height: number };
  alignment: TextAlignment;
  spacing: { top: number; right: number; bottom: number; left: number };
  columnGap: number;
  font: string;
  fontSize: number;
  fontWeight: FontWeight;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  leftColor: string;
  rightColor: string;
  surface: SurfaceAppearance;
  surfaceColor: string;
  surfaceOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  gradient: GradientValue;
  stages: AnimationStageValue;
};

const comparisonItems: ComparisonItem[] = [
  { left: "结构清晰", right: "信息堆叠", accentColor: "#2dd4bf", icon: "icon.check" },
  { left: "容易复用", right: "一次性制作", accentColor: "#38bdf8", icon: "icon.check" },
];

const comparisonConclusionDefaults: ComparisonConclusionParams = {
  title: "选择合适的表达方式",
  leftHeading: "方案 A",
  rightHeading: "方案 B",
  items: comparisonItems,
  conclusion: "清晰的结构比更多装饰更重要",
  supportingText: "先说结论，再补充依据。",
  showItems: true,
  showConclusion: false,
  layoutMode: "split",
  highlightSide: "left",
  position: { x: 0.5, y: 0.63 },
  size: { width: 0.62, height: 0.36 },
  alignment: "left",
  spacing: { top: 22, right: 24, bottom: 22, left: 24 },
  columnGap: 18,
  font: "font.system-sans",
  fontSize: 28,
  fontWeight: "700",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  accentColor: "#2dd4bf",
  leftColor: "#2dd4bf",
  rightColor: "#fb7185",
  surface: "solid",
  surfaceColor: "#111827",
  surfaceOpacity: 0.94,
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 18,
  gradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#111827" },
      { offset: 1, color: "#172554" },
    ],
  },
  stages: createStages({ enterDirection: "left", exitDirection: "right" }),
};

/** 中文注释：结构化条目只保留渲染安全上限，异常输入不改变持久化数组。 */
function resolveComparisonItems(value: unknown): ComparisonItem[] {
  if (!Array.isArray(value)) return comparisonItems;
  return value.slice(0, 4).filter((item): item is ComparisonItem => (
    typeof item === "object" && item !== null &&
    typeof (item as ComparisonItem).left === "string" &&
    typeof (item as ComparisonItem).right === "string" &&
    typeof (item as ComparisonItem).accentColor === "string" &&
    typeof (item as ComparisonItem).icon === "string"
  ));
}

/** 中文注释：渲染左右对比和结论章，同一族通过布局模式切换信息组织而不增加专用面板协议。 */
export const ComparisonConclusion: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...comparisonConclusionDefaults, ...params } as ComparisonConclusionParams;
  const items = resolveComparisonItems(values.items);
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
  const verdictMode = values.layoutMode === "verdict";
  const titleHeight = Math.max(1, values.fontSize * 1.5);
  const conclusionHeight = Math.max(1, content.height * 0.38);
  const listHeight = Math.max(1, content.height - titleHeight - (verdictMode ? conclusionHeight : 0));
  const itemHeight = Math.max(1, listHeight / Math.max(1, items.length));
  const columnWidth = Math.max(1, (content.width - values.columnGap) / 2);

  return (
    <div
      data-effect-family="comparison-conclusion"
      data-starting-style-id={startingStyleId}
      data-template-id="comparison-conclusion"
      data-layout-mode={values.layoutMode}
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
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: `${values.spacing.top}px ${values.spacing.right}px ${values.spacing.bottom}px ${values.spacing.left}px`,
            width: "100%",
          }}
        >
          <ResponsiveText
            fontAssetId={values.font}
            fontSize={Math.max(15, values.fontSize * 0.7)}
            height={titleHeight}
            maxLines={2}
            maxWidth={content.width}
            style={{ color: values.mutedColor, fontWeight: 800, letterSpacing: 1, textAlign: values.alignment }}
            text={values.title}
            width={content.width}
          />
          {verdictMode && values.showConclusion ? (
            <div data-comparison-conclusion="true" style={{ borderLeft: values.alignment === "left" ? `4px solid ${values.accentColor}` : undefined, borderRight: values.alignment === "right" ? `4px solid ${values.accentColor}` : undefined, marginBottom: 10, paddingLeft: values.alignment === "left" ? 14 : 0, paddingRight: values.alignment === "right" ? 14 : 0 }}>
              <ResponsiveText
                fontAssetId={values.font}
                fontSize={Math.max(20, values.fontSize * 1.35)}
                height={conclusionHeight}
                maxLines={3}
                maxWidth={content.width}
                style={{ color: values.textColor, fontWeight: 800, textAlign: values.alignment }}
                text={values.conclusion}
                width={content.width}
              />
              <ResponsiveText
                fontAssetId={values.font}
                fontSize={Math.max(12, values.fontSize * 0.46)}
                height={Math.max(1, conclusionHeight * 0.42)}
                maxLines={2}
                maxWidth={content.width}
                style={{ color: values.mutedColor, marginTop: 5, textAlign: values.alignment }}
                text={values.supportingText}
                width={content.width}
              />
            </div>
          ) : null}
          {values.showItems ? (
            <div data-comparison-items="true" style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", gap: 6, minHeight: 0 }}>
              <div style={{ display: "grid", gap: values.columnGap, gridTemplateColumns: `${columnWidth}px ${columnWidth}px`, height: Math.max(1, values.fontSize * 1.7) }}>
                <ResponsiveText
                  fontAssetId={values.font}
                  fontSize={Math.max(12, values.fontSize * 0.5)}
                  height={Math.max(1, values.fontSize * 1.7)}
                  maxLines={1}
                  maxWidth={columnWidth}
                  style={{ color: values.leftColor, fontWeight: 800, textAlign: values.alignment }}
                  text={values.leftHeading}
                  width={columnWidth}
                />
                <ResponsiveText
                  fontAssetId={values.font}
                  fontSize={Math.max(12, values.fontSize * 0.5)}
                  height={Math.max(1, values.fontSize * 1.7)}
                  maxLines={1}
                  maxWidth={columnWidth}
                  style={{ color: values.rightColor, fontWeight: 800, textAlign: values.alignment }}
                  text={values.rightHeading}
                  width={columnWidth}
                />
              </div>
              <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", gap: 6, minHeight: 0 }}>
                {items.map((item, index) => {
                  const itemMotion = resolveMotion(values.stages, frame, durationInFrames, width, height, index);
                  const leftHighlight = values.highlightSide === "left";
                  const rightHighlight = values.highlightSide === "right";
                  return (
                    <div
                      data-comparison-item-index={index}
                      key={`${item.left}-${item.right}-${index}`}
                      style={{ display: "grid", gap: values.columnGap, gridTemplateColumns: `${columnWidth}px ${columnWidth}px`, minHeight: 0, opacity: itemMotion.opacity, transform: itemMotion.transform }}
                    >
                      <div style={{ alignItems: "center", backgroundColor: leftHighlight ? withAlpha(item.accentColor, 0.16) : "transparent", borderLeft: `3px solid ${item.accentColor}`, boxSizing: "border-box", display: "flex", gap: 7, minHeight: itemHeight, overflow: "hidden", padding: "6px 8px" }}>
                        <BuiltInAssetImage assetId={item.icon} style={{ flex: "0 0 auto", height: Math.max(13, values.fontSize * 0.46), width: Math.max(13, values.fontSize * 0.46) }} />
                        <ResponsiveText
                          fontAssetId={values.font}
                          fontSize={Math.max(12, values.fontSize * 0.58)}
                          height={Math.max(1, itemHeight - 12)}
                          maxLines={2}
                          maxWidth={Math.max(1, columnWidth - values.fontSize * 0.46 - 24)}
                          style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
                          text={item.left}
                          width={Math.max(1, columnWidth - values.fontSize * 0.46 - 24)}
                        />
                      </div>
                      <div style={{ alignItems: "center", backgroundColor: rightHighlight ? withAlpha(item.accentColor, 0.16) : "transparent", borderRight: `3px solid ${item.accentColor}`, boxSizing: "border-box", display: "flex", gap: 7, minHeight: itemHeight, overflow: "hidden", padding: "6px 8px" }}>
                        <ResponsiveText
                          fontAssetId={values.font}
                          fontSize={Math.max(12, values.fontSize * 0.58)}
                          height={Math.max(1, itemHeight - 12)}
                          maxLines={2}
                          maxWidth={Math.max(1, columnWidth - 16)}
                          style={{ color: values.textColor, fontWeight: values.fontWeight, textAlign: values.alignment }}
                          text={item.right}
                          width={Math.max(1, columnWidth - 16)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </EffectCard>
    </div>
  );
};

ComparisonConclusion.definition = defineEffectFamily({
  id: "comparison-conclusion",
  version: 1,
  category: "information-overlay",
  name: "对比与结论",
  description: "用结构化左右对比和最终判断呈现差异、取舍与结论。",
  purposeTags: ["对比", "结论", "优缺点"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 144,
  parameters: [
    { key: "title", label: "对比标题", description: "说明当前对比或结论主题的标题。", type: "text", defaultValue: comparisonConclusionDefaults.title, maxLength: 60, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "leftHeading", label: "左侧标题", description: "左右对比中第一列的方案、状态或观点名称。", type: "text", defaultValue: comparisonConclusionDefaults.leftHeading, maxLength: 28, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "rightHeading", label: "右侧标题", description: "左右对比中第二列的方案、状态或观点名称。", type: "text", defaultValue: comparisonConclusionDefaults.rightHeading, maxLength: 28, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "items", label: "对比条目", description: "每行独立保存左右内容、强调色和内置图标，支持排序。", type: "structured-list", defaultValue: comparisonConclusionDefaults.items, itemSchema: [{ key: "left", label: "左侧内容", description: "第一列的差异内容。", type: "multiline-text", defaultValue: "左侧观点", maxLength: 60 }, { key: "right", label: "右侧内容", description: "第二列的差异内容。", type: "multiline-text", defaultValue: "右侧观点", maxLength: 60 }, { key: "accentColor", label: "行强调色", description: "当前对比行的边界和突出背景颜色。", type: "color", defaultValue: "#2dd4bf" }, { key: "icon", label: "行图标", description: "当前对比行使用的内置图标。", type: "icon", defaultValue: "icon.check", options: iconOptions }], minItems: 1, maxItems: 4, allowReordering: true, group: "content", level: "basic", styleSwitch: "preserve" },
    { key: "conclusion", label: "结论正文", description: "结论章中需要观众记住的最终判断。", type: "multiline-text", defaultValue: comparisonConclusionDefaults.conclusion, maxLength: 120, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "supportingText", label: "结论说明", description: "为最终判断提供上下文的补充说明。", type: "multiline-text", defaultValue: comparisonConclusionDefaults.supportingText, maxLength: 100, group: "content", level: "advanced", styleSwitch: "preserve" },
    { key: "position", label: "位置", description: "对比或结论卡片中心点在画布中的安全位置。", type: "position", defaultValue: comparisonConclusionDefaults.position, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "size", label: "尺寸", description: "对比或结论卡片在画布中的宽高比例。", type: "size", defaultValue: comparisonConclusionDefaults.size, group: "layout", level: "basic", styleSwitch: "preserve", safety: "warn-on-overflow" },
    { key: "alignment", label: "对齐", description: "标题、列内容和结论正文的水平对齐方式。", type: "select", defaultValue: comparisonConclusionDefaults.alignment, options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "spacing", label: "内边距", description: "对比卡片内容与边界之间的四边间距。", type: "spacing", defaultValue: comparisonConclusionDefaults.spacing, min: 0, max: 72, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "columnGap", label: "列间距", description: "左右对比两列之间的间距。", type: "number", defaultValue: comparisonConclusionDefaults.columnGap, min: 0, max: 64, step: 1, group: "layout", level: "advanced", styleSwitch: "replace" },
    { key: "font", label: "字体", description: "对比和结论文字使用的内置字体素材槽位。", type: "font", defaultValue: comparisonConclusionDefaults.font, options: fontOptions, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "fontSize", label: "字号", description: "对比和结论正文请求字号，内容会在卡片空间内自适应。", type: "number", defaultValue: comparisonConclusionDefaults.fontSize, min: 16, max: 72, step: 1, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "fontWeight", label: "字重", description: "对比和结论正文的内置字体字重。", type: "select", defaultValue: comparisonConclusionDefaults.fontWeight, options: [{ value: "500", label: "中等" }, { value: "600", label: "半粗" }, { value: "700", label: "粗体" }, { value: "800", label: "特粗" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "textColor", label: "正文颜色", description: "左右内容和结论正文的文字颜色。", type: "color", defaultValue: comparisonConclusionDefaults.textColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "mutedColor", label: "辅助颜色", description: "标题、列标题和结论说明的辅助文字颜色。", type: "color", defaultValue: comparisonConclusionDefaults.mutedColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "accentColor", label: "结论强调色", description: "结论标记和整体强调线的颜色。", type: "color", defaultValue: comparisonConclusionDefaults.accentColor, group: "appearance", level: "basic", styleSwitch: "replace" },
    { key: "leftColor", label: "左侧颜色", description: "左侧标题和对比边界的颜色。", type: "color", defaultValue: comparisonConclusionDefaults.leftColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "rightColor", label: "右侧颜色", description: "右侧标题和对比边界的颜色。", type: "color", defaultValue: comparisonConclusionDefaults.rightColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surface", label: "背景外观", description: "选择无背景、实色、玻璃或描边对比卡片。", type: "select", defaultValue: comparisonConclusionDefaults.surface, options: [{ value: "none", label: "无背景" }, { value: "solid", label: "实色" }, { value: "glass", label: "玻璃" }, { value: "outline", label: "描边" }], group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceColor", label: "背景颜色", description: "对比或结论卡片背景的基础颜色。", type: "color", defaultValue: comparisonConclusionDefaults.surfaceColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "surfaceOpacity", label: "背景透明度", description: "对比或结论卡片背景的透明度。", type: "number", defaultValue: comparisonConclusionDefaults.surfaceOpacity, min: 0.1, max: 1, step: 0.05, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderColor", label: "边框颜色", description: "玻璃或描边对比卡片使用的边框颜色。", type: "color", defaultValue: comparisonConclusionDefaults.borderColor, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "borderWidth", label: "边框粗细", description: "对比或结论卡片边框的像素宽度。", type: "number", defaultValue: comparisonConclusionDefaults.borderWidth, min: 0, max: 8, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "radius", label: "圆角", description: "对比或结论卡片背景容器的圆角半径。", type: "number", defaultValue: comparisonConclusionDefaults.radius, min: 0, max: 48, step: 1, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "gradient", label: "背景渐变", description: "玻璃对比卡片使用的可编辑渐变色标。", type: "gradient", defaultValue: comparisonConclusionDefaults.gradient, minStops: 2, maxStops: 4, group: "appearance", level: "advanced", styleSwitch: "replace" },
    { key: "showItems", label: "显示对比条目", description: "控制左右对比条目区域是否显示。", type: "boolean", defaultValue: comparisonConclusionDefaults.showItems, group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "showConclusion", label: "显示结论正文", description: "控制结论章正文和补充说明是否显示。", type: "boolean", defaultValue: comparisonConclusionDefaults.showConclusion, group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "layoutMode", label: "组织方式", description: "选择左右对比或结论章的内容组织方式。", type: "select", defaultValue: comparisonConclusionDefaults.layoutMode, options: [{ value: "split", label: "左右对比" }, { value: "verdict", label: "结论章" }], group: "behavior", level: "basic", styleSwitch: "replace" },
    { key: "highlightSide", label: "突出一侧", description: "在左右对比中突出左侧、右侧或保持平衡。", type: "select", defaultValue: comparisonConclusionDefaults.highlightSide, options: [{ value: "left", label: "突出左侧" }, { value: "right", label: "突出右侧" }, { value: "none", label: "保持平衡" }], group: "behavior", level: "advanced", styleSwitch: "replace" },
    { key: "stages", label: "动画阶段", description: "对比条目和结论卡片的入场、持续和出场阶段。", type: "animation-stage", defaultValue: comparisonConclusionDefaults.stages, stages: ["enter", "sustain", "exit"], group: "animation", level: "advanced", styleSwitch: "replace" },
  ],
  startingStyles: [
    {
      id: "side-by-side",
      name: "左右对比",
      description: "用两列结构和逐行条目呈现方案、状态或优缺点差异。",
      visualDirection: "简洁信息",
      defaultParams: { title: "选择合适的表达方式", leftHeading: "方案 A", rightHeading: "方案 B", layoutMode: "split", showItems: true, showConclusion: false, highlightSide: "left", surface: "solid", surfaceColor: "#111827", leftColor: "#2dd4bf", rightColor: "#fb7185", stages: createStages({ enterDirection: "left", exitDirection: "right", stagger: 4, sustainDirection: "up", sustainEasing: "ease-in-out", sustainIntensity: 0.003 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.64 }, size: { width: 0.62, height: 0.36 } },
        "9:16": { position: { x: 0.5, y: 0.6 }, size: { width: 0.88, height: 0.4 } },
        "1:1": { position: { x: 0.5, y: 0.62 }, size: { width: 0.84, height: 0.42 } },
      },
    },
    {
      id: "verdict-chapter",
      name: "结论章",
      description: "以居中结论和简短依据收束一段知识讲解。",
      visualDirection: "科技数据",
      defaultParams: { title: "最终结论", conclusion: "清晰的结构比更多装饰更重要", supportingText: "先说结论，再补充依据。", layoutMode: "verdict", showItems: false, showConclusion: true, highlightSide: "none", surface: "glass", surfaceColor: "#0f172a", font: "font.system-mono", fontSize: 30, alignment: "center", accentColor: "#38bdf8", borderColor: "#38bdf8", radius: 24, stages: createStages({ enterDirection: "right", exitDirection: "left", enterIntensity: 0.12, stagger: 2, sustainDirection: "right", sustainIntensity: 0.005 }) },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.7 }, size: { width: 0.62, height: 0.3 } },
        "9:16": { position: { x: 0.5, y: 0.66 }, size: { width: 0.88, height: 0.32 } },
        "1:1": { position: { x: 0.5, y: 0.68 }, size: { width: 0.84, height: 0.34 } },
      },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <ComparisonConclusion {...props} />,
});
