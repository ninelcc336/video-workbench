import type { CSSProperties, ReactNode } from "react";
import { staticFile } from "remotion";
import {
  getBuiltInFontFamily,
  resolveBuiltInAsset,
} from "../../domain/assets/built-in-assets";
import type { GradientValue } from "../../domain/templates/types";
import { createSeededRandom } from "./random";

const PARTICLE_LIMIT = 64;

/** 中文注释：通过 Remotion 静态文件解析器生成环境相关 URL，开发预览和 bundle 渲染共享同一素材路径。 */
function resolveAssetUrl(assetId: string): string {
  return staticFile(resolveBuiltInAsset(assetId).filePath);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 中文注释：把十六进制颜色转换为带透明度的 CSS 颜色，供所有信息族共享并对非法输入做安全回退。 */
export function withAlpha(color: string, opacity: number): string {
  const normalized = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
    ? color.slice(1)
    : "000000";
  const rgb = normalized.length <= 4
    ? normalized.slice(0, 3).split("").map((channel) => `${channel}${channel}`).join("")
    : normalized.slice(0, 6);
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rgb}${alpha}`;
}

/** 中文注释：用字符宽度估算文本占用，避免渲染阶段依赖浏览器测量或不可复现的布局状态。 */
function estimateTextUnits(text: string): number {
  return Array.from(text).reduce((total, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return total + (codePoint >= 0x2e80 ? 1 : 0.56);
  }, 0);
}

/** 中文注释：按字符宽度估算换行行数，为不同画幅和显式换行提供统一的垂直空间约束。 */
function estimateTextLines(text: string, maxWidth: number, fontSize: number): number {
  const unitsPerLine = Math.max(1, maxWidth / (Math.max(1, fontSize) * 0.62));
  return text.split(/\r?\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(estimateTextUnits(line) / unitsPerLine)),
    0,
  );
}

/** 中文注释：在宽度和高度约束内寻找最大字号；必要时突破可读下限以避免响应式文字被静默裁切。 */
function resolveFittingFontSize(input: {
  text: string;
  maxWidth: number;
  height: number;
  requestedFontSize: number;
  minFontSize: number;
}): number {
  const widthLimitedFontSize = input.maxWidth / (
    Math.max(1, estimateTextUnits(input.text.split(/\r?\n/).sort((left, right) => estimateTextUnits(right) - estimateTextUnits(left))[0])) * 0.62
  );
  const upperBound = Math.min(
    input.requestedFontSize,
    Math.max(input.minFontSize, widthLimitedFontSize),
  );
  const fitsHeight = (fontSize: number): boolean =>
    estimateTextLines(input.text, input.maxWidth, fontSize) * fontSize * 1.28 <= input.height;

  if (fitsHeight(upperBound)) return upperBound;

  // 中文注释：二分求值保持固定次数，保证相同输入在浏览器和离线渲染中得到同一字号。
  let low = 1;
  let high = upperBound;
  for (let index = 0; index < 24; index += 1) {
    const middle = (low + high) / 2;
    if (fitsHeight(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export type ResponsiveTextLayout = {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  maxLines: number;
};

/**
 * 中文注释：按画幅安全比例、估算字符宽度和可用高度计算字号；极端长文本优先保留完整内容。
 */
export function resolveResponsiveTextLayout(input: {
  text: string;
  width: number;
  height: number;
  fontSize?: number;
  maxWidth?: number;
  maxLines?: number;
  minFontSize?: number;
}): ResponsiveTextLayout {
  const width = Number.isFinite(input.width) ? Math.max(1, input.width) : 1;
  const height = Number.isFinite(input.height) ? Math.max(1, input.height) : 1;
  const portrait = height > width;
  const safeRatio = portrait ? 0.84 : 0.76;
  const maxWidth = Math.min(width, Math.max(1, input.maxWidth ?? width * safeRatio));
  const requestedFontSize = Number.isFinite(input.fontSize)
    ? Math.max(1, input.fontSize ?? 1)
    : Math.max(14, height * 0.052);
  const minFontSize = Number.isFinite(input.minFontSize)
    ? Math.max(1, input.minFontSize ?? 1)
    : Math.max(10, Math.min(14, height * 0.012));
  const requestedLines = Math.max(1, Math.round(input.maxLines ?? (portrait ? 5 : 3)));
  const fontSize = resolveFittingFontSize({
    text: input.text,
    maxWidth,
    height,
    requestedFontSize,
    minFontSize,
  });
  const estimatedLines = estimateTextLines(input.text, maxWidth, fontSize);

  return {
    fontSize,
    lineHeight: fontSize * 1.28,
    maxWidth,
    // 中文注释：高度不足时仍保留完整估算行数，只有异常极端输入才由上层明确裁切。
    maxLines: Math.max(requestedLines, estimatedLines),
  };
}

/** 中文注释：把结构化渐变转换为 CSS 字符串，顺序和偏移固定以保证截图与导出一致。 */
export function gradientToCss(gradient: GradientValue): string {
  const angle = Number.isFinite(gradient.angle) ? gradient.angle : 0;
  const stops = [...gradient.stops]
    .filter((stop) => typeof stop.color === "string" && Number.isFinite(stop.offset))
    .sort((left, right) => left.offset - right.offset)
    .map((stop) => `${stop.color} ${clamp(stop.offset, 0, 1) * 100}%`);

  return stops.length > 0 ? `linear-gradient(${angle}deg, ${stops.join(", ")})` : "transparent";
}

export type ShadowSpec = {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color: string;
};

/** 中文注释：阴影只输出有限 CSS 数值，避免高级参数把渲染器带入非法样式。 */
export function createShadowStyle(shadow: ShadowSpec): string {
  const x = Number.isFinite(shadow.x) ? shadow.x : 0;
  const y = Number.isFinite(shadow.y) ? shadow.y : 0;
  const blur = Number.isFinite(shadow.blur) ? Math.max(0, shadow.blur ?? 0) : 0;
  const spread = Number.isFinite(shadow.spread) ? shadow.spread : 0;

  return `${x}px ${y}px ${blur}px ${spread}px ${shadow.color}`;
}

/** 中文注释：遮罩进度 0 表示完全隐藏、1 表示完全显示，方向只改变裁切边缘。 */
export function resolveMaskClipPath(
  progress: number,
  direction: "left" | "right" | "up" | "down" = "left",
): string {
  const visible = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * 100;
  const hidden = 100 - visible;

  switch (direction) {
    case "right":
      return `inset(0 0 0 ${hidden}%)`;
    case "up":
      return `inset(${hidden}% 0 0 0)`;
    case "down":
      return `inset(0 0 ${hidden}% 0)`;
    case "left":
    default:
      return `inset(0 ${hidden}% 0 0)`;
  }
}

/** 中文注释：SVG 路径通过固定长度和偏移实现可求值的绘制进度，不依赖 DOM 测量。 */
export function resolvePathDrawStyle(progress: number, pathLength = 1): {
  strokeDasharray: number;
  strokeDashoffset: number;
} {
  const safeLength = Number.isFinite(pathLength) ? Math.max(1, pathLength) : 1;
  const visible = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);

  return {
    strokeDasharray: safeLength,
    strokeDashoffset: safeLength * (1 - visible),
  };
}

export type ParticlePoint = {
  x: number;
  y: number;
  size: number;
  opacity: number;
};

/**
 * 中文注释：粒子位置由项目种子、粒子编号和局部帧直接求值，数量上限用于保护预览和离线渲染负载。
 */
export function createParticlePoints(
  seed: string,
  count: number,
  frame: number,
): ParticlePoint[] {
  const safeCount = Number.isFinite(count)
    ? clamp(Math.floor(count), 0, PARTICLE_LIMIT)
    : 0;
  const safeFrame = Number.isFinite(frame) ? frame : 0;
  const random = createSeededRandom(seed);

  return Array.from({ length: safeCount }, (_, index) => {
    const baseIndex = index * 4;
    const baseX = random(baseIndex) * 100;
    const baseY = random(baseIndex + 1) * 100;
    const phase = random(baseIndex + 2) * Math.PI * 2;
    const drift = safeFrame * 0.035 + phase;

    return {
      x: (baseX + Math.sin(drift) * 1.5 + 100) % 100,
      y: (baseY + Math.cos(drift) * 1.5 + 100) % 100,
      size: 1 + random(baseIndex + 3) * 3,
      opacity: 0.25 + random(baseIndex + 2) * 0.55,
    };
  });
}

/** 中文注释：响应式文字统一消费内置字体槽位，并把安全宽度和换行约束写入同一渲染节点。 */
export function ResponsiveText({
  text,
  width,
  height,
  fontSize,
  fontAssetId = "font.system-sans",
  maxWidth,
  maxLines,
  style,
}: {
  text: string;
  width: number;
  height: number;
  fontSize?: number;
  fontAssetId?: string;
  maxWidth?: number;
  maxLines?: number;
  style?: CSSProperties;
}) {
  const layout = resolveResponsiveTextLayout({ text, width, height, fontSize, maxWidth, maxLines });
  const fontAsset = resolveBuiltInAsset(fontAssetId);
  const fontFamily = getBuiltInFontFamily(fontAssetId);
  const fontAssetUrl = resolveAssetUrl(fontAssetId);

  return (
    <div
      data-font-asset-id={fontAsset.id}
      data-font-asset-url={fontAssetUrl}
      data-effect-primitive="responsive-text"
      style={{
        boxSizing: "border-box",
        display: "-webkit-box",
        fontSize: layout.fontSize,
        fontFamily,
        // 中文注释：布局函数返回的是绝对像素行高，必须保留单位，避免浏览器把数字误解为字号倍数。
        lineHeight: `${layout.lineHeight}px`,
        maxWidth: layout.maxWidth,
        overflow: "hidden",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: layout.maxLines,
        ...style,
      }}
    >
      <BuiltInFontStyles assetId={fontAssetId} />
      {text}
    </div>
  );
}

/** 中文注释：通过 CSS @import 加载台账文件，让浏览器和 Remotion 使用同一个冻结字体资源。 */
export function BuiltInFontStyles({ assetId }: { assetId: string }) {
  const asset = resolveBuiltInAsset(assetId);
  if (asset.kind !== "font") {
    throw new Error(`图像素材不能作为字体样式加载：${assetId}`);
  }

  return (
    <style
      data-effect-primitive="font-styles"
      data-font-asset-url={resolveAssetUrl(assetId)}
    >
      {`@import url("${resolveAssetUrl(assetId)}");`}
    </style>
  );
}

/** 中文注释：图标和装饰图像只能从内置素材解析器读取，确保预览与导出指向同一冻结文件。 */
export function BuiltInAssetImage({
  assetId,
  alt = "",
  style,
}: {
  assetId: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const asset = resolveBuiltInAsset(assetId);
  if (asset.kind === "font") {
    throw new Error(`字体素材不能作为图像渲染：${assetId}`);
  }
  const assetUrl = resolveAssetUrl(assetId);

  return (
    <img
      alt={alt}
      aria-hidden={alt ? undefined : true}
      data-asset-id={asset.id}
      data-effect-primitive="asset-image"
      src={assetUrl}
      style={style}
    />
  );
}

/** 中文注释：卡片原语集中处理背景、渐变、描边、圆角和阴影，内容由调用方继续组合。 */
export function EffectCard({
  children,
  background = "rgba(15, 23, 42, 0.88)",
  gradient,
  borderColor = "transparent",
  borderWidth = 0,
  borderRadius = 16,
  shadow,
  style,
}: {
  children: ReactNode;
  background?: string;
  gradient?: GradientValue;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: ShadowSpec;
  style?: CSSProperties;
}) {
  return (
    <div
      data-effect-primitive="card"
      style={{
        background: gradient ? gradientToCss(gradient) : background,
        border: `${Math.max(0, borderWidth)}px solid ${borderColor}`,
        borderRadius: Math.max(0, borderRadius),
        boxShadow: shadow ? createShadowStyle(shadow) : undefined,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 中文注释：遮罩原语把阶段进度转换为 CSS 裁切，适合普通 DOM 内容的确定性揭示动画。 */
export function EffectMask({
  children,
  progress,
  direction = "left",
  style,
}: {
  children: ReactNode;
  progress: number;
  direction?: "left" | "right" | "up" | "down";
  style?: CSSProperties;
}) {
  return (
    <div
      data-effect-primitive="mask"
      style={{
        clipPath: resolveMaskClipPath(progress, direction),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 中文注释：直线描边原语使用固定 SVG 视口和路径进度，避免不同画布下布局发生跳动。 */
export function EffectStroke({
  x1,
  y1,
  x2,
  y2,
  progress = 1,
  color = "currentColor",
  strokeWidth = 2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg aria-hidden="true" data-effect-primitive="stroke" height="100%" viewBox="0 0 100 100" width="100%">
      <line
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
        fill="none"
        pathLength={1}
        stroke={color}
        strokeWidth={strokeWidth}
        style={resolvePathDrawStyle(progress, 1)}
      />
    </svg>
  );
}

/** 中文注释：任意 SVG 路径通过描边偏移实现绘制动画，调用方只需提供路径数据和进度。 */
export function EffectPath({
  d,
  progress = 1,
  color = "currentColor",
  strokeWidth = 2,
}: {
  d: string;
  progress?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg aria-hidden="true" data-effect-primitive="path" height="100%" viewBox="0 0 100 100" width="100%">
      <path
        d={d}
        fill="none"
        pathLength={1}
        stroke={color}
        strokeWidth={strokeWidth}
        style={resolvePathDrawStyle(progress, 1)}
      />
    </svg>
  );
}

/** 中文注释：粒子原语只渲染受限数量的绝对定位点，位置和漂浮由项目种子与局部帧直接计算。 */
export function EffectParticleField({
  seed,
  count,
  frame,
  color = "currentColor",
}: {
  seed: string;
  count: number;
  frame: number;
  color?: string;
}) {
  return (
    <div data-effect-primitive="particles" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {createParticlePoints(seed, count, frame).map((particle, index) => (
        <span
          aria-hidden="true"
          data-particle-index={index}
          key={index}
          style={{
            backgroundColor: color,
            borderRadius: "50%",
            height: particle.size,
            left: `${particle.x}%`,
            opacity: particle.opacity,
            position: "absolute",
            top: `${particle.y}%`,
            width: particle.size,
          }}
        />
      ))}
    </div>
  );
}
