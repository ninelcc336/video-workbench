import React from "react";
import { defineEffectFamily } from "../../domain/templates/effect-family";
import type { EffectFamilyDefinition, EffectFamilyRenderProps } from "../../domain/templates/types";
import { getVisibilityProgress } from "./animation";

/** 中文注释：评论面板参数覆盖目标视频右侧半透明评论卡片的内容、尺寸和入场方式。 */
export type CommentPanelOverlayParams = {
  title: string;
  body: string;
  tag: string;
  panelColor: string;
  accentColor: string;
  textColor: string;
  opacity: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  enterDirection: "left" | "right" | "top" | "bottom";
  animationDuration: number;
  showTag: boolean;
};

const commentPanelDefaults: CommentPanelOverlayParams = {
  title: "来自朋友的一条信息",
  body: "我可以把这个项目做成一个真正能帮助创作者的工具吗？",
  tag: "主要是先把体验做完",
  panelColor: "#f8fafc",
  accentColor: "#14b8a6",
  textColor: "#334155",
  opacity: 0.86,
  position: { x: 0.76, y: 0.36 },
  size: { width: 0.34, height: 0.25 },
  enterDirection: "right",
  animationDuration: 20,
  showTag: true,
};

/** 中文注释：根据入场方向返回面板初始位移，保持不同方向的参数语义一致。 */
function getPanelOffset(
  direction: CommentPanelOverlayParams["enterDirection"],
  distance: number,
): { x: number; y: number } {
  switch (direction) {
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    case "top":
      return { x: 0, y: -distance };
    case "bottom":
      return { x: 0, y: distance };
  }
}

/** 中文注释：渲染带头像标记、正文和可选标签的半透明评论面板。 */
export const CommentPanelOverlay: React.FC<EffectFamilyRenderProps> & {
  definition: EffectFamilyDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...commentPanelDefaults, ...params } as CommentPanelOverlayParams;
  // 中文注释：出场复用入场方向和时长，让面板离开画面时保持相同的运动语义。
  const progress = getVisibilityProgress(frame, durationInFrames, values.animationDuration);
  const offset = getPanelOffset(values.enterDirection, 0.08 * (1 - progress));
  const left = (values.position.x + offset.x) * width;
  const top = (values.position.y + offset.y) * height;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: values.size.width * width,
        minHeight: values.size.height * height,
        boxSizing: "border-box",
        padding: 18,
        borderRadius: 18,
        backgroundColor: values.panelColor,
        color: values.textColor,
        opacity: progress * values.opacity,
        transform: "translate(-50%, -50%) scale(" + (0.96 + progress * 0.04) + ")",
        fontFamily: "sans-serif",
        boxShadow: "0 18px 50px rgba(15, 23, 42, 0.28)",
      }}
      data-template-id="comment-panel-overlay"
    >
      <div style={{ alignItems: "center", display: "flex", gap: 10, marginBottom: 12 }}>
        <span
          style={{
            alignItems: "center",
            backgroundColor: values.accentColor,
            borderRadius: "50%",
            color: "#ffffff",
            display: "inline-flex",
            fontSize: Math.max(14, height * 0.018),
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          •
        </span>
        <span style={{ fontSize: Math.max(13, height * 0.018), fontWeight: 700 }}>{values.title}</span>
      </div>
      <div
        style={{
          fontSize: Math.max(14, height * 0.021),
          lineHeight: 1.55,
          whiteSpace: "pre-line",
        }}
      >
        {values.body}
      </div>
      {values.showTag && values.tag && (
        <div
          style={{
            backgroundColor: `${values.accentColor}22`,
            borderRadius: 8,
            color: values.accentColor,
            display: "inline-block",
            fontSize: Math.max(11, height * 0.015),
            fontWeight: 700,
            marginTop: 14,
            padding: "6px 9px",
          }}
        >
          {values.tag}
        </div>
      )}
    </div>
  );
};

CommentPanelOverlay.definition = defineEffectFamily({
  id: "comment-panel-overlay",
  version: 1,
  category: "information-overlay",
  name: "评论面板卡",
  description: "复刻视频中的半透明评论、聊天和消息信息面板。",
  purposeTags: ["引用", "评论"],
  visualDirections: ["简洁信息", "活力社媒"],
  defaultDurationInFrames: 105,
  parameters: [
    { key: "title", label: "面板标题", type: "text", defaultValue: commentPanelDefaults.title, maxLength: 40 },
    { key: "body", label: "面板正文", type: "text", defaultValue: commentPanelDefaults.body, maxLength: 180 },
    { key: "tag", label: "底部标签", type: "text", defaultValue: commentPanelDefaults.tag, maxLength: 40 },
    { key: "panelColor", label: "面板颜色", type: "color", defaultValue: commentPanelDefaults.panelColor },
    { key: "accentColor", label: "头像颜色", type: "color", defaultValue: commentPanelDefaults.accentColor },
    { key: "textColor", label: "文字颜色", type: "color", defaultValue: commentPanelDefaults.textColor },
    { key: "opacity", label: "面板透明度", type: "number", defaultValue: commentPanelDefaults.opacity, min: 0.1, max: 1, step: 0.05 },
    { key: "position", label: "位置", type: "position", defaultValue: commentPanelDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: commentPanelDefaults.size },
    {
      key: "enterDirection",
      label: "入场方向",
      type: "select",
      defaultValue: commentPanelDefaults.enterDirection,
      options: [
        { value: "left", label: "左侧" },
        { value: "right", label: "右侧" },
        { value: "top", label: "上方" },
        { value: "bottom", label: "下方" },
      ],
    },
    { key: "animationDuration", label: "入场/出场时长", type: "number", defaultValue: commentPanelDefaults.animationDuration, min: 1, max: 90, step: 1 },
    { key: "showTag", label: "显示底部标签", type: "boolean", defaultValue: commentPanelDefaults.showTag },
  ],
  startingStyles: [{ id: "default", name: "评论卡", visualDirection: "简洁信息", defaultParams: commentPanelDefaults }],
  aspectRatioDefaults: {},
  render: (props) => <CommentPanelOverlay {...props} />,
});
