import React from "react";
import { Easing, interpolate } from "remotion";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";
import { getVisibilityProgress } from "./animation";

/** 中文注释：标签胶囊参数支持用换行或逗号输入多个短标签。 */
export type TagPillsOverlayParams = {
  title: string;
  tags: string;
  accentColor: string;
  pillColor: string;
  textColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  animationDuration: number;
};

const tagPillsDefaults: TagPillsOverlayParams = {
  title: "OPC REALITY",
  tags: "写字楼合租\n每天上下班跑\n远程协作",
  accentColor: "#f8fafc",
  pillColor: "#334155aa",
  textColor: "#f8fafc",
  position: { x: 0.29, y: 0.26 },
  size: { width: 0.42, height: 0.14 },
  animationDuration: 18,
};

/** 中文注释：把多行或逗号分隔的输入转换成有限数量的可视标签。 */
function parseTags(value: string): string[] {
  return value
    .split(/[\r\n,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** 中文注释：渲染标题和逐个弹入的标签胶囊，适合作为章节标题的补充信息层。 */
export const TagPillsOverlay: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...tagPillsDefaults, ...params } as TagPillsOverlayParams;
  const tags = parseTags(values.tags);
  const left = values.position.x * width;
  const top = values.position.y * height;
  // 中文注释：整组标签在尾部统一淡出并反向移动，逐项入场仍保持原有节奏。
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
        transform: `translate(-50%, -50%) translateY(${(1 - visibilityProgress) * 18}px)`,
        opacity: visibilityProgress,
        color: values.textColor,
        fontFamily: "sans-serif",
        textShadow: "0 3px 14px rgba(0, 0, 0, 0.42)",
      }}
      data-template-id="tag-pills-overlay"
    >
      <div
        style={{
          color: values.accentColor,
          fontSize: Math.max(10, height * 0.014),
          fontWeight: 700,
          letterSpacing: 3,
          marginBottom: 10,
        }}
      >
        {values.title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tags.map((tag, index) => {
          const progress = interpolate(
            frame,
            [index * 3, index * 3 + Math.max(1, values.animationDuration)],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );

          return (
            <span
              key={`${tag}-${index}`}
              style={{
                backgroundColor: values.pillColor,
                border: `1px solid ${values.accentColor}55`,
                borderRadius: 8,
                display: "inline-block",
                fontSize: Math.max(12, height * 0.016),
                fontWeight: 650,
                opacity: progress,
                padding: "7px 10px",
                transform: `translateY(${(1 - progress) * 10}px)`,
              }}
            >
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
};

TagPillsOverlay.definition = {
  id: "tag-pills-overlay",
  version: 1,
  category: "information-overlay",
  name: "标签胶囊组",
  description: "用小型标签、分类和状态胶囊补充章节信息。",
  defaultDurationInFrames: 90,
  parameters: [
    { key: "title", label: "标签标题", type: "text", defaultValue: tagPillsDefaults.title, maxLength: 30 },
    { key: "tags", label: "标签内容", type: "text", defaultValue: tagPillsDefaults.tags, maxLength: 160 },
    { key: "accentColor", label: "边框颜色", type: "color", defaultValue: tagPillsDefaults.accentColor },
    { key: "pillColor", label: "胶囊颜色", type: "color", defaultValue: tagPillsDefaults.pillColor },
    { key: "textColor", label: "文字颜色", type: "color", defaultValue: tagPillsDefaults.textColor },
    { key: "position", label: "位置", type: "position", defaultValue: tagPillsDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: tagPillsDefaults.size },
    { key: "animationDuration", label: "入场/出场时长", type: "number", defaultValue: tagPillsDefaults.animationDuration, min: 1, max: 90, step: 1 },
  ],
  render: (props) => <TagPillsOverlay {...props} />,
};
