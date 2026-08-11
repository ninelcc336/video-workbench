import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EffectCard,
  BuiltInAssetImage,
  BuiltInFontStyles,
  EffectMask,
  EffectPath,
  EffectStroke,
  ResponsiveText,
  createParticlePoints,
  createShadowStyle,
  gradientToCss,
  resolveMaskClipPath,
  resolvePathDrawStyle,
  resolveResponsiveTextLayout,
} from "./primitives";

describe("2D 渲染原语", () => {
  it("根据画幅和文本长度计算可读的响应式文字布局", () => {
    const short = resolveResponsiveTextLayout({
      text: "章节标题",
      width: 1920,
      height: 1080,
      fontSize: 72,
    });
    const long = resolveResponsiveTextLayout({
      text: "这是一段需要在窄画幅中继续保持可读性的较长中文标题内容",
      width: 1080,
      height: 1920,
      fontSize: 72,
    });

    expect(short.maxWidth).toBeLessThanOrEqual(1920);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.maxWidth).toBeLessThanOrEqual(1080 * 0.84);
    expect(long.lineHeight).toBeGreaterThan(long.fontSize);
  });

  it("生成渐变、阴影、遮罩和路径绘制的稳定样式值", () => {
    expect(gradientToCss({
      angle: 135,
      stops: [
        { offset: 0, color: "#ffffff" },
        { offset: 1, color: "#000000" },
      ],
    })).toBe("linear-gradient(135deg, #ffffff 0%, #000000 100%)");
    expect(createShadowStyle({ x: 2, y: 4, blur: 12, color: "#00000066" })).toBe(
      "2px 4px 12px 0px #00000066",
    );
    expect(resolveMaskClipPath(0.5, "left")).toBe("inset(0 50% 0 0)");
    expect(resolvePathDrawStyle(0.25, 200)).toMatchObject({
      strokeDasharray: 200,
      strokeDashoffset: 150,
    });
  });

  it("使用同一套原语渲染卡片、文字、描边、路径和遮罩", () => {
    const markup = renderToStaticMarkup(
      <EffectMask progress={0.75} direction="right">
        <EffectCard background="#111827" shadow={{ x: 0, y: 4, blur: 16, color: "#00000055" }}>
          <ResponsiveText fontAssetId="font.system-sans" text="可读标题" width={640} height={360} />
          <BuiltInAssetImage assetId="icon.check" alt="勾选" />
          <BuiltInAssetImage assetId="decoration.spark" />
          <EffectStroke x1={0} y1={0} x2={100} y2={100} progress={0.5} />
          <EffectPath d="M0 0 L100 100" progress={0.5} />
        </EffectCard>
      </EffectMask>,
    );

    expect(markup).toContain("data-effect-primitive=\"mask\"");
    expect(markup).toContain("data-effect-primitive=\"card\"");
    expect(markup).toContain("data-effect-primitive=\"responsive-text\"");
    expect(markup).toContain("data-font-asset-id=\"font.system-sans\"");
    expect(markup).toContain("data-effect-primitive=\"font-styles\"");
    expect(markup).toContain("/effect-assets/fonts/system-sans.css");
    expect(markup).toContain("src=\"/effect-assets/icons/check.svg\"");
    expect(markup).toContain("src=\"/effect-assets/decorations/spark.svg\"");
    expect(markup).toContain("data-effect-primitive=\"stroke\"");
    expect(markup).toContain("data-effect-primitive=\"path\"");
    expect(markup).toContain("pathLength=\"1\"");
  });

  it("字体原语通过稳定 URL 加载冻结的本地样式文件", () => {
    const markup = renderToStaticMarkup(<BuiltInFontStyles assetId="font.system-sans" />);

    expect(markup).toContain("data-effect-primitive=\"font-styles\"");
    expect(markup).toContain("data-font-asset-url=\"/effect-assets/fonts/system-sans.css\"");
  });

  it("按项目种子和帧生成受数量上限约束的轻量粒子", () => {
    const first = createParticlePoints("project-seed", 12, 18);
    const second = createParticlePoints("project-seed", 12, 18);
    const capped = createParticlePoints("project-seed", 1000, 18);

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(capped).toHaveLength(64);
    expect(first.every((particle) =>
      particle.x >= 0 && particle.x <= 100 && particle.y >= 0 && particle.y <= 100,
    )).toBe(true);
  });
});
