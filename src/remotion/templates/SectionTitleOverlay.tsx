import React from "react";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";
import { getVisibilityProgress } from "./animation";

/** 中文注释：章节标题模板的可调参数，覆盖目标视频左上角的章节信息层。 */
export type SectionTitleOverlayParams = {
  number: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  animationDuration: number;
  showSubtitle: boolean;
};

const sectionTitleDefaults: SectionTitleOverlayParams = {
  number: "01",
  eyebrow: "INCOMING DM",
  title: "一个值得关注的主题",
  subtitle: "用清晰的信息层讲好一个观点",
  accentColor: "#2dd4bf",
  textColor: "#ffffff",
  mutedColor: "#cbd5e1",
  position: { x: 0.31, y: 0.23 },
  size: { width: 0.46, height: 0.24 },
  animationDuration: 18,
  showSubtitle: true,
};

/** 中文注释：渲染章节编号、英文眉标题、中文标题和可选副标题。 */
export const SectionTitleOverlay: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...sectionTitleDefaults, ...params } as SectionTitleOverlayParams;
  // 中文注释：标题从上方进入，并在片段尾部沿同一路径反向退出。
  const progress = getVisibilityProgress(frame, durationInFrames, values.animationDuration);
  const left = values.position.x * width;
  const top = values.position.y * height;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: values.size.width * width,
        minHeight: values.size.height * height,
        boxSizing: "border-box",
        transform: `translate(-50%, -50%) translateY(${(1 - progress) * -18}px)`,
        opacity: progress,
        color: values.textColor,
        fontFamily: "sans-serif",
        textShadow: "0 3px 16px rgba(0, 0, 0, 0.42)",
      }}
      data-template-id="section-title-overlay"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span
          style={{
            color: values.accentColor,
            fontSize: Math.max(18, height * 0.032),
            fontWeight: 800,
            letterSpacing: 1,
            lineHeight: 1,
          }}
        >
          {values.number}
        </span>
        <span
          style={{
            color: values.accentColor,
            fontSize: Math.max(10, height * 0.013),
            fontWeight: 700,
            letterSpacing: 3,
            lineHeight: 1,
          }}
        >
          {values.eyebrow}
        </span>
      </div>
      <div
        style={{
          borderLeft: `3px solid ${values.accentColor}`,
          paddingLeft: 14,
        }}
      >
        <div
          style={{
            fontSize: Math.max(24, height * 0.043),
            fontWeight: 800,
            lineHeight: 1.15,
          }}
        >
          {values.title}
        </div>
        {values.showSubtitle && values.subtitle && (
          <div
            style={{
              color: values.mutedColor,
              fontSize: Math.max(13, height * 0.018),
              lineHeight: 1.35,
              marginTop: 8,
            }}
          >
            {values.subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

SectionTitleOverlay.definition = {
  id: "section-title-overlay",
  version: 1,
  category: "information-overlay",
  name: "章节标题卡",
  description: "复刻科技解说视频左上角的章节编号和标题信息层。",
  defaultDurationInFrames: 90,
  parameters: [
    { key: "number", label: "章节编号", type: "text", defaultValue: sectionTitleDefaults.number, maxLength: 8 },
    { key: "eyebrow", label: "英文眉标题", type: "text", defaultValue: sectionTitleDefaults.eyebrow, maxLength: 30 },
    { key: "title", label: "中文标题", type: "text", defaultValue: sectionTitleDefaults.title, maxLength: 50 },
    { key: "subtitle", label: "副标题", type: "text", defaultValue: sectionTitleDefaults.subtitle, maxLength: 80 },
    { key: "accentColor", label: "强调色", type: "color", defaultValue: sectionTitleDefaults.accentColor },
    { key: "textColor", label: "标题颜色", type: "color", defaultValue: sectionTitleDefaults.textColor },
    { key: "mutedColor", label: "副标题颜色", type: "color", defaultValue: sectionTitleDefaults.mutedColor },
    { key: "position", label: "位置", type: "position", defaultValue: sectionTitleDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: sectionTitleDefaults.size },
    {
      key: "animationDuration",
      label: "入场/出场时长",
      type: "number",
      defaultValue: sectionTitleDefaults.animationDuration,
      min: 1,
      max: 90,
      step: 1,
    },
    { key: "showSubtitle", label: "显示副标题", type: "boolean", defaultValue: sectionTitleDefaults.showSubtitle },
  ],
  render: (props) => <SectionTitleOverlay {...props} />,
};
