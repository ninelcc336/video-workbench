import React from "react";
import { Easing, interpolate } from "remotion";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";
import { getVisibilityProgress } from "./animation";

/** 中文注释：信息清单使用“普通文字|重点文字”描述每一行，便于在现有文本参数控件中编辑。 */
export type ChecklistOverlayParams = {
  title: string;
  items: string;
  accentColor: string;
  highlightColor: string;
  textColor: string;
  mutedColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  animationDuration: number;
  itemGap: number;
};

const checklistDefaults: ChecklistOverlayParams = {
  title: "安心去创作",
  items: "做一个软件|分分钟被抄\n做一个产品|分分钟被抄\n做一个短视频|被洗稿、搬运",
  accentColor: "#34d399",
  highlightColor: "#fb7185",
  textColor: "#f8fafc",
  mutedColor: "#cbd5e1",
  position: { x: 0.32, y: 0.47 },
  size: { width: 0.48, height: 0.34 },
  animationDuration: 24,
  itemGap: 10,
};

type ChecklistItem = { label: string; highlight?: string };

/** 中文注释：解析“普通文字|重点文字”格式，并忽略空行以保持模板输入稳定。 */
function parseChecklistItems(value: string): ChecklistItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("|");
      if (separatorIndex < 0) return { label: line };
      return {
        label: line.slice(0, separatorIndex).trim(),
        highlight: line.slice(separatorIndex + 1).trim(),
      };
    });
}

/** 中文注释：渲染带逐行入场的清单信息层，用强调色突出每行结论。 */
export const ChecklistOverlay: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...checklistDefaults, ...params } as ChecklistOverlayParams;
  const items = parseChecklistItems(values.items).slice(0, 8);
  const left = values.position.x * width;
  const top = values.position.y * height;
  // 中文注释：清单整体在片段尾部淡出并回到入场前的位置，避免内容突然消失。
  const visibilityProgress = getVisibilityProgress(frame, durationInFrames, values.animationDuration);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: values.size.width * width,
        minHeight: values.size.height * height,
        boxSizing: "border-box",
        opacity: visibilityProgress,
        transform: `translate(-50%, -50%) translateY(${(1 - visibilityProgress) * -18}px)`,
        color: values.textColor,
        fontFamily: "sans-serif",
        textShadow: "0 3px 14px rgba(0, 0, 0, 0.45)",
      }}
      data-template-id="checklist-overlay"
    >
      <div
        style={{
          color: values.mutedColor,
          fontSize: Math.max(12, height * 0.017),
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {values.title}
      </div>
      {items.map((item, index) => {
        const progress = interpolate(
          frame,
          [index * 4, index * 4 + Math.max(1, values.animationDuration)],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          },
        );

        return (
          <div
            key={`${item.label}-${index}`}
            style={{
              alignItems: "center",
              backgroundColor: "rgba(15, 23, 42, 0.56)",
              borderLeft: `2px solid ${values.accentColor}`,
              display: "flex",
              gap: 9,
              marginBottom: values.itemGap,
              opacity: progress,
              padding: "7px 10px",
              transform: `translateX(${(1 - progress) * -20}px)`,
            }}
          >
            <span style={{ color: values.accentColor, fontSize: Math.max(12, height * 0.016) }}>◈</span>
            <span style={{ fontSize: Math.max(14, height * 0.021), fontWeight: 650 }}>{item.label}</span>
            {item.highlight && (
              <span style={{ color: values.highlightColor, fontSize: Math.max(14, height * 0.021), fontWeight: 800 }}>
                {item.highlight}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

ChecklistOverlay.definition = {
  id: "checklist-overlay",
  version: 1,
  category: "information-overlay",
  name: "信息清单卡",
  description: "用图标、条目和重点色复刻科技解说中的观点清单。",
  defaultDurationInFrames: 120,
  parameters: [
    { key: "title", label: "清单标题", type: "text", defaultValue: checklistDefaults.title, maxLength: 40 },
    {
      key: "items",
      label: "清单内容",
      description: "每行一条；使用“普通文字|重点文字”突出结论。",
      type: "text",
      defaultValue: checklistDefaults.items,
      maxLength: 300,
    },
    { key: "accentColor", label: "图标颜色", type: "color", defaultValue: checklistDefaults.accentColor },
    { key: "highlightColor", label: "重点颜色", type: "color", defaultValue: checklistDefaults.highlightColor },
    { key: "textColor", label: "文字颜色", type: "color", defaultValue: checklistDefaults.textColor },
    { key: "mutedColor", label: "辅助文字颜色", type: "color", defaultValue: checklistDefaults.mutedColor },
    { key: "position", label: "位置", type: "position", defaultValue: checklistDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: checklistDefaults.size },
    {
      key: "animationDuration",
      label: "入场/出场时长",
      type: "number",
      defaultValue: checklistDefaults.animationDuration,
      min: 1,
      max: 90,
      step: 1,
    },
    { key: "itemGap", label: "行间距", type: "number", defaultValue: checklistDefaults.itemGap, min: 0, max: 40, step: 1 },
  ],
  render: (props) => <ChecklistOverlay {...props} />,
};
