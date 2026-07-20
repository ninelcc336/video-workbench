import React from "react";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";
import { getVisibilityProgress } from "./animation";

export type CardOverlayParams = {
  text: string;
  color: string;
  textColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  enterDirection: "left" | "right" | "top" | "bottom";
  animationDuration: number;
  radius: number;
};

const cardDefaults: CardOverlayParams = {
  text: "重点内容",
  color: "#111827",
  textColor: "#ffffff",
  position: { x: 0.5, y: 0.72 },
  size: { width: 0.72, height: 0.14 },
  enterDirection: "left",
  animationDuration: 18,
  radius: 24,
};

const getOffset = (direction: CardOverlayParams["enterDirection"], distance: number) => {
  switch (direction) {
    case "right":
      return { x: distance, y: 0 };
    case "top":
      return { x: 0, y: -distance };
    case "bottom":
      return { x: 0, y: distance };
    case "left":
      return { x: -distance, y: 0 };
  }
};

export const CardOverlay: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...cardDefaults, ...params } as CardOverlayParams;
  // 中文注释：同一进度覆盖入场和出场，片段结束前会沿入场方向反向退场。
  const progress = getVisibilityProgress(frame, durationInFrames, values.animationDuration);
  const offset = getOffset(values.enterDirection, 0.08 * (1 - progress));
  const left = (values.position.x + offset.x) * width;
  const top = (values.position.y + offset.y) * height;

  // 中文注释：文字、颜色、位置和尺寸来自参数声明；音频由主视频轨道处理，不在模板内混音。
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: values.size.width * width,
        height: values.size.height * height,
        transform: `translate(-50%, -50%) scale(${0.94 + progress * 0.06})`,
        opacity: progress,
        backgroundColor: values.color,
        borderRadius: values.radius,
        color: values.textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        fontSize: Math.max(20, height * 0.035),
        fontWeight: 700,
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.2)",
      }}
      data-template-id="card-overlay"
      data-duration-in-frames={durationInFrames}
    >
      {values.text}
    </div>
  );
};

CardOverlay.definition = {
  id: "card-overlay",
  version: 1,
  category: "information-overlay",
  name: "弹入卡片",
  description: "带有弹入动画的信息卡片。",
  defaultDurationInFrames: 60,
  parameters: [
    { key: "text", label: "文字", type: "text", defaultValue: cardDefaults.text, maxLength: 80 },
    { key: "color", label: "卡片颜色", type: "color", defaultValue: cardDefaults.color },
    { key: "textColor", label: "文字颜色", type: "color", defaultValue: cardDefaults.textColor },
    { key: "position", label: "位置", type: "position", defaultValue: cardDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: cardDefaults.size },
    {
      key: "enterDirection",
      label: "入场方向",
      type: "select",
      defaultValue: cardDefaults.enterDirection,
      options: [
        { value: "left", label: "左侧" },
        { value: "right", label: "右侧" },
        { value: "top", label: "上方" },
        { value: "bottom", label: "下方" },
      ],
    },
    {
      key: "animationDuration",
      label: "入场/出场时长",
      type: "number",
      defaultValue: cardDefaults.animationDuration,
      min: 1,
      max: 120,
      step: 1,
    },
    {
      key: "radius",
      label: "圆角",
      type: "number",
      defaultValue: cardDefaults.radius,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
  render: (props) => <CardOverlay {...props} />,
};
