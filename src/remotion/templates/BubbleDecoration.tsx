import React from "react";
import { Easing, interpolate } from "remotion";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";

type BubbleParams = {
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  opacity: number;
  count: number;
};

const bubbleDefaults: BubbleParams = {
  color: "#38bdf8",
  position: { x: 0.78, y: 0.2 },
  size: { width: 0.18, height: 0.18 },
  opacity: 0.75,
  count: 5,
};

export const BubbleDecoration: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...bubbleDefaults, ...params } as BubbleParams;
  // 中文注释：用片段帧数计算统一的漂浮进度，确保 Player 预览和导出渲染可重复。
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const bubbleCount = Math.max(1, Math.round(values.count));
  const bubbleWidth = values.size.width * width;
  const bubbleHeight = values.size.height * height;

  // 中文注释：气泡只绘制 SVG 装饰，不读取或处理音频；原始音频属于视频片段边界。
  return (
    <svg
      aria-hidden="true"
      height={height}
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
      data-template-id="bubble-decoration"
    >
      {Array.from({ length: bubbleCount }, (_, index) => {
        const phase = index / bubbleCount;
        const drift = Math.sin((progress + phase) * Math.PI * 2) * bubbleHeight * 0.12;
        const x = values.position.x * width + (index - (bubbleCount - 1) / 2) * bubbleWidth * 0.42;
        const y = values.position.y * height + drift;
        const radius = Math.max(6, bubbleWidth * (0.16 + index * 0.025));
        const opacity = values.opacity * (0.55 + 0.45 * Math.sin((progress + phase) * Math.PI) ** 2);

        return (
          <circle
            cx={x}
            cy={y}
            fill={values.color}
            key={index}
            opacity={opacity}
            r={radius}
          />
        );
      })}
    </svg>
  );
};

BubbleDecoration.definition = {
  id: "bubble-decoration",
  version: 1,
  category: "decorative-animation",
  name: "漂浮气泡",
  description: "在画面中生成轻盈的 2D 漂浮气泡。",
  defaultDurationInFrames: 75,
  parameters: [
    { key: "color", label: "气泡颜色", type: "color", defaultValue: bubbleDefaults.color },
    { key: "position", label: "位置", type: "position", defaultValue: bubbleDefaults.position },
    { key: "size", label: "尺寸", type: "size", defaultValue: bubbleDefaults.size },
    {
      key: "opacity",
      label: "透明度",
      type: "number",
      defaultValue: bubbleDefaults.opacity,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: "count",
      label: "数量",
      type: "number",
      defaultValue: bubbleDefaults.count,
      min: 1,
      max: 12,
      step: 1,
    },
  ],
  render: (props) => <BubbleDecoration {...props} />,
};
