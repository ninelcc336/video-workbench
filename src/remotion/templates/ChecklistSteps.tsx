import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  GradientValue,
} from "../../domain/templates/types";
import { BuiltInAssetImage, EffectCard, ResponsiveText } from "./primitives";
import { evaluateAnimationStages } from "./animation";

type ChecklistStepItem = {
  body: string;
  highlight: string;
  icon: string;
  accentColor: string;
};

export type ChecklistStepsParams = {
  title: string;
  items: ChecklistStepItem[];
  itemMarker: "check" | "number";
  orientation: "vertical" | "horizontal";
  alignment: "left" | "center" | "right";
  position: { x: number; y: number };
  size: { width: number; height: number };
  font: string;
  fontSize: number;
  fontWeight: "500" | "600" | "700" | "800";
  textColor: string;
  mutedColor: string;
  highlightColor: string;
  cardAppearance: "solid" | "glass" | "outline";
  cardColor: string;
  cardOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  spacing: { top: number; right: number; bottom: number; left: number };
  itemGap: number;
  cardGradient: GradientValue;
  stages: AnimationStageValue;
};

const checklistItems: ChecklistStepItem[] = [
  { body: "先定义问题", highlight: "明确目标", icon: "icon.check", accentColor: "#2dd4bf" },
  { body: "再组织信息", highlight: "建立结构", icon: "icon.check", accentColor: "#38bdf8" },
  { body: "最后给结论", highlight: "推动行动", icon: "icon.check", accentColor: "#fbbf24" },
];

const defaultStages: AnimationStageValue = {
  enter: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "left",
    easing: "ease-out",
    intensity: 0.08,
    stagger: 4,
  },
  sustain: {
    durationInFrames: 90,
    delayInFrames: 0,
    direction: "none",
    easing: "linear",
    intensity: 1,
    stagger: 0,
  },
  exit: {
    durationInFrames: 18,
    delayInFrames: 0,
    direction: "right",
    easing: "ease-in",
    intensity: 0.05,
    stagger: 2,
  },
};

const checklistDefaults: ChecklistStepsParams = {
  title: "一套清晰的执行步骤",
  items: checklistItems,
  itemMarker: "check",
  orientation: "vertical",
  alignment: "left",
  position: { x: 0.5, y: 0.64 },
  size: { width: 0.58, height: 0.4 },
  font: "font.system-sans",
  fontSize: 26,
  fontWeight: "600",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  highlightColor: "#fbbf24",
  cardAppearance: "glass",
  cardColor: "#0f172a",
  cardOpacity: 0.82,
  borderColor: "#2dd4bf",
  borderWidth: 1,
  radius: 18,
  spacing: { top: 24, right: 26, bottom: 24, left: 26 },
  itemGap: 8,
  cardGradient: {
    angle: 135,
    stops: [
      { offset: 0, color: "#0f172a" },
      { offset: 1, color: "#172554" },
    ],
  },
  stages: defaultStages,
};

const iconOptions = [{ value: "icon.check", label: "勾选" }];
const fontOptions = [
  { value: "font.system-sans", label: "系统无衬线" },
  { value: "font.system-mono", label: "系统等宽" },
];

/** 中文注释：把十六进制颜色统一转换为带透明度的六位 RGB 颜色，兼容三位、四位和八位输入。 */
function withAlpha(color: string, opacity: number): string {
  const normalized = color.replace("#", "");
  const rgb = normalized.length === 3 || normalized.length === 4
    ? normalized.slice(0, 3).split("").map((channel) => `${channel}${channel}`).join("")
    : normalized.slice(0, 6);
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rgb}${alpha}`;
}

/** 中文注释：根据卡片外观把统一颜色参数转换为不影响文字透明度的背景样式。 */
function resolveCardBackground(values: ChecklistStepsParams): string {
  const opacity = values.cardAppearance === "outline"
    ? values.cardOpacity * 0.18
    : values.cardOpacity;
  return withAlpha(values.cardColor, opacity);
}

/** 中文注释：把卡片颜色和透明度写入渐变首个色标，同时保留用户对角度和其他色标的高级调整。 */
function resolveCardGradient(values: ChecklistStepsParams): GradientValue {
  return {
    ...values.cardGradient,
    stops: values.cardGradient.stops.map((stop, index) => ({
      ...stop,
      color: index === 0
        ? withAlpha(values.cardColor, values.cardOpacity)
        : withAlpha(stop.color, values.cardOpacity),
    })),
  };
}

/** 中文注释：集中解析卡片外观的背景、渐变和阴影，避免新增外观时遗漏其中一处条件分支。 */
function resolveCardAppearance(values: ChecklistStepsParams): {
  background: string;
  gradient?: GradientValue;
  shadow?: { blur: number; color: string; x: number; y: number };
} {
  return {
    background: resolveCardBackground(values),
    gradient: values.cardAppearance === "glass" ? resolveCardGradient(values) : undefined,
    shadow: values.cardAppearance === "outline"
      ? undefined
      : { blur: 34, color: "#00000055", x: 0, y: 16 },
  };
}

/** 中文注释：将族内阶段求值转换为行级 CSS，保证跳帧、暂停和离线渲染使用相同结果。 */
function resolveItemMotion(
  values: ChecklistStepsParams,
  frame: number,
  durationInFrames: number,
  index: number,
  width: number,
  height: number,
): { opacity: number; transform: string } {
  const evaluation = evaluateAnimationStages({
    frame,
    durationInFrames,
    stages: values.stages,
    itemIndex: index,
  });
  const offsetX = evaluation.offset.x * width;
  const offsetY = evaluation.offset.y * height;
  return {
    opacity: evaluation.visibility,
    transform: `translate(${offsetX}px, ${offsetY}px)`,
  };
}

/** 中文注释：根据样式的标记策略渲染稳定编号或审核过的本地图标素材。 */
function renderItemMarker(
  item: ChecklistStepItem,
  index: number,
  marker: ChecklistStepsParams["itemMarker"],
  markerSize: number,
): React.ReactNode {
  if (marker === "number") {
    return (
      <span
        aria-hidden="true"
        style={{
          alignItems: "center",
          backgroundColor: item.accentColor,
          borderRadius: "50%",
          color: "#0f172a",
          display: "inline-flex",
          flex: "0 0 auto",
          fontSize: Math.max(12, markerSize * 0.42),
          fontWeight: 800,
          height: markerSize,
          justifyContent: "center",
          width: markerSize,
        }}
      >
        {index + 1}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: "center",
        backgroundColor: withAlpha(item.accentColor, 0.18),
        borderRadius: "50%",
        display: "inline-flex",
        flex: "0 0 auto",
        height: markerSize,
        justifyContent: "center",
        width: markerSize,
      }}
    >
      <BuiltInAssetImage assetId={item.icon} style={{ height: markerSize * 0.58, width: markerSize * 0.58 }} />
    </span>
  );
}

/** 中文注释：渲染清单与步骤族的统一卡片；样式只改变声明参数，条目结构和动画算法保持同一实现。 */
export const ChecklistSteps: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params, startingStyleId }) => {
  const values = { ...checklistDefaults, ...params } as ChecklistStepsParams;
  const items = (Array.isArray(values.items) ? values.items : checklistItems).slice(0, 8);
  const cardWidth = Math.max(1, values.size.width * width);
  const cardHeight = Math.max(1, values.size.height * height);
  const horizontal = values.orientation === "horizontal";
  const columns = horizontal ? Math.min(4, Math.max(1, items.length)) : 1;
  const rows = horizontal ? Math.max(1, Math.ceil(items.length / columns)) : Math.max(1, items.length);
  const markerSize = Math.max(24, Math.min(42, values.fontSize * 1.15));
  const cardAppearance = resolveCardAppearance(values);
  const borderWidth = values.borderWidth;
  const titleFontSize = Math.max(13, values.fontSize * 0.62);
  const contentHeight = Math.max(1, cardHeight - values.spacing.top - values.spacing.bottom);
  const titleContentHeight = titleFontSize * 2.56;
  const titleHeight = titleContentHeight + Math.max(8, values.itemGap);
  const itemAreaHeight = Math.max(1, contentHeight - titleHeight);

  return (
    <div
      data-effect-family="checklist-steps"
      data-starting-style-id={startingStyleId}
      data-template-id="checklist-steps"
      style={{
        height: "100%",
        left: values.position.x * width,
        position: "absolute",
        top: values.position.y * height,
        transform: "translate(-50%, -50%)",
        width: cardWidth,
      }}
    >
      <EffectCard
        background={cardAppearance.background}
        borderColor={values.borderColor}
        borderRadius={values.radius}
        borderWidth={borderWidth}
        gradient={cardAppearance.gradient}
        shadow={cardAppearance.shadow}
        style={{ height: cardHeight, width: cardWidth }}
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
            fontSize={titleFontSize}
            height={titleContentHeight}
            maxLines={2}
            maxWidth={cardWidth - values.spacing.left - values.spacing.right}
            style={{
              color: values.mutedColor,
              flex: "0 0 auto",
              fontWeight: 700,
              letterSpacing: 1.2,
              marginBottom: Math.max(8, values.itemGap),
              textAlign: values.alignment,
            }}
            text={values.title}
            width={cardWidth - values.spacing.left - values.spacing.right}
          />
          <div
            style={{
              display: "grid",
              flex: "1 1 auto",
              gap: values.itemGap,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              minHeight: 0,
            }}
          >
            {items.map((item, index) => {
              const motion = resolveItemMotion(values, frame, durationInFrames, index, width, height);
              const contentWidth = horizontal
                ? (cardWidth - values.spacing.left - values.spacing.right - values.itemGap * (columns - 1)) / columns
                : cardWidth - values.spacing.left - values.spacing.right;
              const itemFontSize = Math.max(12, horizontal ? values.fontSize * 0.62 : values.fontSize * 0.72);
              const highlightFontSize = Math.max(11, itemFontSize * 0.78);
              const textWidth = Math.max(1, contentWidth - markerSize - 12);
              const itemHeight = itemAreaHeight / rows;
              const itemPaddingHeight = horizontal ? 16 : 12;
              const itemContentHeight = Math.max(1, itemHeight - itemPaddingHeight);
              const highlightHeight = item.highlight ? highlightFontSize * 1.28 : 0;
              const bodyHeight = Math.max(1, itemContentHeight - highlightHeight - (item.highlight ? 3 : 0));

              return (
                <div
                  data-checklist-item-index={index}
                  key={`${item.body}-${index}`}
                  style={{
                    alignItems: horizontal ? "flex-start" : "center",
                    borderLeft: horizontal ? undefined : `3px solid ${item.accentColor}`,
                    boxSizing: "border-box",
                    display: "flex",
                    gap: 10,
                    minHeight: 0,
                    opacity: motion.opacity,
                    overflow: "hidden",
                    padding: horizontal ? 8 : "6px 10px",
                    textAlign: values.alignment,
                    transform: motion.transform,
                  }}
                >
                  {renderItemMarker(item, index, values.itemMarker, markerSize)}
                  <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", minWidth: 0 }}>
                    <ResponsiveText
                      fontAssetId={values.font}
                      fontSize={itemFontSize}
                      height={bodyHeight}
                      maxLines={2}
                      maxWidth={textWidth}
                      style={{
                        color: values.textColor,
                        fontWeight: values.fontWeight,
                        textAlign: values.alignment,
                      }}
                      text={item.body}
                      width={textWidth}
                    />
                    {item.highlight ? (
                      <ResponsiveText
                        fontAssetId={values.font}
                        fontSize={highlightFontSize}
                        height={Math.max(1, highlightHeight)}
                        maxLines={1}
                        maxWidth={textWidth}
                        style={{
                          color: values.highlightColor,
                          fontWeight: 800,
                          marginTop: 3,
                          textAlign: values.alignment,
                        }}
                        text={item.highlight}
                        width={textWidth}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </EffectCard>
    </div>
  );
};

ChecklistSteps.definition = defineEffectFamily({
  id: "checklist-steps",
  version: 1,
  category: "information-overlay",
  name: "清单与步骤",
  description: "把并列观点、操作步骤和流程节点组织成可编辑的信息卡片。",
  purposeTags: ["清单", "步骤", "流程"],
  visualDirections: ["简洁信息", "科技数据", "活力社媒"],
  defaultDurationInFrames: 144,
  parameters: [
    {
      key: "title",
      label: "清单标题",
      description: "说明这一组条目的共同主题。",
      type: "multiline-text",
      defaultValue: checklistDefaults.title,
      maxLength: 60,
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "items",
      label: "清单条目",
      description: "每个条目独立编辑正文、重点文字、图标和强调色。",
      type: "structured-list",
      defaultValue: checklistDefaults.items,
      itemSchema: [
        { key: "body", label: "正文", type: "multiline-text", defaultValue: "新的步骤", maxLength: 60 },
        { key: "highlight", label: "重点文字", type: "text", defaultValue: "重点", maxLength: 30 },
        { key: "icon", label: "图标", type: "icon", defaultValue: "icon.check", options: iconOptions },
        { key: "accentColor", label: "强调色", type: "color", defaultValue: "#2dd4bf" },
      ],
      minItems: 1,
      maxItems: 8,
      allowReordering: true,
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "position",
      label: "位置",
      type: "position",
      defaultValue: checklistDefaults.position,
      group: "layout",
      level: "basic",
      styleSwitch: "preserve",
      safety: "warn-on-overflow",
    },
    {
      key: "size",
      label: "尺寸",
      type: "size",
      defaultValue: checklistDefaults.size,
      group: "layout",
      level: "basic",
      styleSwitch: "preserve",
      safety: "warn-on-overflow",
    },
    {
      key: "fontSize",
      label: "字号",
      type: "number",
      defaultValue: checklistDefaults.fontSize,
      min: 12,
      max: 72,
      step: 1,
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "textColor",
      label: "文字颜色",
      type: "color",
      defaultValue: checklistDefaults.textColor,
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "highlightColor",
      label: "重点颜色",
      type: "color",
      defaultValue: checklistDefaults.highlightColor,
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "font",
      label: "字体",
      type: "font",
      defaultValue: checklistDefaults.font,
      options: fontOptions,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "fontWeight",
      label: "字重",
      type: "select",
      defaultValue: checklistDefaults.fontWeight,
      options: [
        { value: "500", label: "中等" },
        { value: "600", label: "半粗" },
        { value: "700", label: "粗体" },
        { value: "800", label: "特粗" },
      ],
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "mutedColor",
      label: "辅助文字颜色",
      type: "color",
      defaultValue: checklistDefaults.mutedColor,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "cardAppearance",
      label: "卡片外观",
      type: "select",
      defaultValue: checklistDefaults.cardAppearance,
      options: [
        { value: "solid", label: "实色" },
        { value: "glass", label: "玻璃" },
        { value: "outline", label: "描边" },
      ],
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "cardColor",
      label: "卡片颜色",
      type: "color",
      defaultValue: checklistDefaults.cardColor,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "cardOpacity",
      label: "卡片透明度",
      type: "number",
      defaultValue: checklistDefaults.cardOpacity,
      min: 0.4,
      max: 1,
      step: 0.05,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "cardGradient",
      label: "卡片渐变",
      type: "gradient",
      defaultValue: checklistDefaults.cardGradient,
      minStops: 2,
      maxStops: 4,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "borderColor",
      label: "边框颜色",
      type: "color",
      defaultValue: checklistDefaults.borderColor,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "borderWidth",
      label: "边框粗细",
      type: "number",
      defaultValue: checklistDefaults.borderWidth,
      min: 0,
      max: 8,
      step: 1,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "radius",
      label: "圆角",
      type: "number",
      defaultValue: checklistDefaults.radius,
      min: 0,
      max: 48,
      step: 1,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "alignment",
      label: "对齐",
      type: "select",
      defaultValue: checklistDefaults.alignment,
      options: [
        { value: "left", label: "左对齐" },
        { value: "center", label: "居中" },
        { value: "right", label: "右对齐" },
      ],
      group: "layout",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "spacing",
      label: "内边距",
      type: "spacing",
      defaultValue: checklistDefaults.spacing,
      min: 0,
      max: 72,
      step: 1,
      group: "layout",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "itemGap",
      label: "条目间距",
      type: "number",
      defaultValue: checklistDefaults.itemGap,
      min: 0,
      max: 32,
      step: 1,
      group: "layout",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "itemMarker",
      label: "条目标记",
      type: "select",
      defaultValue: checklistDefaults.itemMarker,
      options: [
        { value: "check", label: "勾选图标" },
        { value: "number", label: "编号" },
      ],
      group: "behavior",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "orientation",
      label: "条目方向",
      type: "select",
      defaultValue: checklistDefaults.orientation,
      options: [
        { value: "vertical", label: "纵向" },
        { value: "horizontal", label: "横向" },
      ],
      group: "behavior",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "stages",
      label: "动画阶段",
      type: "animation-stage",
      defaultValue: checklistDefaults.stages,
      stages: ["enter", "sustain", "exit"],
      group: "animation",
      level: "advanced",
      styleSwitch: "replace",
    },
  ],
  startingStyles: [
    {
      id: "information-list",
      name: "信息清单",
      description: "用玻璃卡片和勾选图标整理并列观点。",
      visualDirection: "简洁信息",
      defaultParams: {
        title: "把复杂观点拆成清晰清单",
        itemMarker: "check",
        orientation: "vertical",
        cardAppearance: "glass",
        cardColor: "#0f172a",
        cardOpacity: 0.82,
        borderColor: "#2dd4bf",
        borderWidth: 1,
        radius: 18,
        spacing: { top: 24, right: 26, bottom: 24, left: 26 },
        itemGap: 8,
        stages: defaultStages,
      },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.64 }, size: { width: 0.58, height: 0.4 } },
        "9:16": { position: { x: 0.5, y: 0.62 }, size: { width: 0.84, height: 0.36 } },
        "1:1": { position: { x: 0.5, y: 0.62 }, size: { width: 0.82, height: 0.42 } },
      },
    },
    {
      id: "numbered-steps",
      name: "编号步骤",
      description: "用编号和清晰层级呈现可执行的步骤。",
      visualDirection: "科技数据",
      defaultParams: {
        title: "三步完成一次有效复盘",
        itemMarker: "number",
        orientation: "vertical",
        cardAppearance: "solid",
        cardColor: "#111827",
        cardOpacity: 0.96,
        borderColor: "#38bdf8",
        borderWidth: 1,
        radius: 12,
        spacing: { top: 26, right: 28, bottom: 26, left: 28 },
        itemGap: 6,
        fontWeight: "700",
        stages: {
          ...defaultStages,
          enter: { ...defaultStages.enter, direction: "up", stagger: 5 },
        },
      },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.62 }, size: { width: 0.54, height: 0.44 } },
        "9:16": { position: { x: 0.5, y: 0.58 }, size: { width: 0.86, height: 0.4 } },
        "1:1": { position: { x: 0.5, y: 0.6 }, size: { width: 0.84, height: 0.44 } },
      },
    },
    {
      id: "horizontal-flow",
      name: "横向流程",
      description: "用横向节点连接过程、阶段和流程关系。",
      visualDirection: "活力社媒",
      defaultParams: {
        title: "从问题到结论",
        itemMarker: "number",
        orientation: "horizontal",
        alignment: "center",
        cardAppearance: "outline",
        cardColor: "#0f172a",
        cardOpacity: 0.8,
        borderColor: "#fbbf24",
        borderWidth: 2,
        radius: 22,
        spacing: { top: 22, right: 22, bottom: 22, left: 22 },
        itemGap: 10,
        fontWeight: "700",
        stages: {
          ...defaultStages,
          enter: { ...defaultStages.enter, direction: "right", stagger: 3 },
        },
      },
      parameterConstraints: { items: { maxItems: 6 } },
      aspectRatioDefaults: {
        "16:9": { position: { x: 0.5, y: 0.72 }, size: { width: 0.84, height: 0.26 } },
        "9:16": { position: { x: 0.5, y: 0.68 }, size: { width: 0.88, height: 0.38 } },
        "1:1": { position: { x: 0.5, y: 0.66 }, size: { width: 0.86, height: 0.42 } },
      },
    },
  ],
  aspectRatioDefaults: {},
  render: (props) => <ChecklistSteps {...props} />,
});
