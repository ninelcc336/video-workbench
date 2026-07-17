import React from "react";
import { Easing, interpolate } from "remotion";
import type { TemplateDefinition, TemplateRenderProps } from "../../domain/templates/types";

type TransitionParams = {
  style: "fade" | "wipe" | "zoom";
  color: string;
};

const transitionDefaults: TransitionParams = {
  style: "fade",
  color: "#000000",
};

export const BasicTransition: React.FC<TemplateRenderProps> & {
  definition: TemplateDefinition;
} = ({ frame, width, height, durationInFrames, params }) => {
  const values = { ...transitionDefaults, ...params } as TransitionParams;
  // 中文注释：转场进度由当前帧和片段总帧数决定，模板不依赖真实时间或浏览器时钟。
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const transitionStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundColor: values.color,
    opacity: values.style === "fade" ? progress : 1,
    pointerEvents: "none",
  };

  if (values.style === "wipe") {
    transitionStyle.clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
  }
  if (values.style === "zoom") {
    transitionStyle.transform = `scale(${1 + (1 - progress) * 0.12})`;
    transitionStyle.transformOrigin = "center";
  }

  // 中文注释：转场只改变画面层的 CSS，不负责视频片段的音频淡化或混音。
  return (
    <div
      aria-hidden="true"
      style={transitionStyle}
      data-template-id="basic-transition"
      data-canvas-size={`${width}x${height}`}
    />
  );
};

BasicTransition.definition = {
  id: "basic-transition",
  version: 1,
  category: "transition",
  name: "基础转场",
  description: "提供淡入淡出、擦除和缩放三种 2D 片段转场。",
  defaultDurationInFrames: 15,
  parameters: [
    {
      key: "style",
      label: "转场样式",
      type: "select",
      defaultValue: transitionDefaults.style,
      options: [
        { value: "fade", label: "淡入淡出" },
        { value: "wipe", label: "擦除" },
        { value: "zoom", label: "缩放" },
      ],
    },
    { key: "color", label: "转场颜色", type: "color", defaultValue: transitionDefaults.color },
  ],
  render: (props) => <BasicTransition {...props} />,
};
