import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
} from "../../domain/templates/effect-family";
import type { EffectFamilyTransitionRenderProps } from "../../domain/templates/types";
import "../../domain/templates/registry";

function createTransitionProps(
  startingStyleId: string,
  params: Record<string, unknown>,
  progress = 0.5,
): EffectFamilyTransitionRenderProps {
  // 中文注释：测试通过稳定的 React 节点模拟前后视频画面，只验证族的双画面组合行为。
  const before = createElement("div", { "data-video-frame": "before" }, "前画面");
  const after = createElement("div", { "data-video-frame": "after" }, "后画面");
  return {
    ...createEffectRenderInput({
      familyId: "directional-transition",
      version: 1,
      startingStyleId,
      aspectRatio: "16:9",
      frame: 8,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 16,
      params,
    }).renderProps,
    localFrame: 8,
    progress,
    canvas: { width: 1920, height: 1080 },
    before: { clipId: "before-video", sourceFrame: 20, frozen: false, node: before },
    after: { clipId: "after-video", sourceFrame: 4, frozen: false, node: after },
  };
}

describe("方向推拉与擦除特效族", () => {
  it("注册三个起始样式并声明转场公共参数", () => {
    const family = getEffectFamily("directional-transition", 1);

    expect(family.name).toBe("方向推拉与擦除");
    expect(family.startingStyles.map((style) => style.id)).toEqual([
      "push-pull",
      "directional-wipe",
      "split-wipe",
    ]);
    expect(family.startingStyles.map((style) => style.name)).toEqual([
      "推拉",
      "方向擦除",
      "分割擦除",
    ]);
    expect(family.parameters.map((parameter) => parameter.key)).toEqual([
      "mode",
      "direction",
      "easing",
      "softness",
      "splitCount",
      "accentColor",
    ]);
    expect(family.renderTransition).toEqual(expect.any(Function));
  });

  it("在三种画幅下生成可渲染的默认实例，并对非法参数回退默认值", () => {
    const family = getEffectFamily("directional-transition", 1);

    for (const aspectRatio of ["16:9", "9:16", "1:1"] as const) {
      const instance = createEffectFamilyInstance(family, "push-pull", aspectRatio);
      expect(instance.params.direction).toBe("left");
      expect(instance.params.accentColor).toBe("#38bdf8");
    }

    const input = createEffectRenderInput({
      familyId: family.id,
      version: family.version,
      startingStyleId: "push-pull",
      aspectRatio: "16:9",
      frame: 8,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 16,
      params: {
        direction: "invalid",
        easing: "invalid",
        softness: Number.NaN,
        splitCount: 99,
        accentColor: "not-a-color",
      },
      });

    expect(input.errors).toHaveLength(5);
    expect(input.renderProps.params).toMatchObject({
      mode: "push-pull",
      direction: "left",
      easing: "ease-in-out",
      softness: 6,
      splitCount: 4,
      accentColor: "#38bdf8",
    });
  });

  it("沿用统一颜色 schema 接受短色和带透明度的强调色", () => {
    const family = getEffectFamily("directional-transition", 1);
    const input = createEffectRenderInput({
      familyId: family.id,
      version: family.version,
      startingStyleId: "push-pull",
      aspectRatio: "16:9",
      frame: 8,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 16,
      params: { accentColor: "#abc8" },
    });

    expect(input.errors).toHaveLength(0);
    expect(input.renderProps.params.accentColor).toBe("#abc8");
  });

  it("三种样式都同时消费前后视频画面", () => {
    const family = getEffectFamily("directional-transition", 1);

    for (const style of family.startingStyles) {
      const instance = createEffectFamilyInstance(family, style.id, "16:9");
      const props = createTransitionProps(style.id, instance.params);
      const markup = renderToStaticMarkup(family.renderTransition!(props));

      expect(markup, style.id).toContain('data-video-frame="before"');
      expect(markup, style.id).toContain('data-video-frame="after"');
      expect(markup, style.id).toContain(`data-transition-style="${style.id}"`);
    }
  });

  it("过渡方式、方向、缓动、边界柔化、强调色和分割数量会改变对应转场行为", () => {
    const family = getEffectFamily("directional-transition", 1);
    const instance = createEffectFamilyInstance(family, "split-wipe", "16:9");
    const render = (overrides: Record<string, unknown>) => renderToStaticMarkup(
      family.renderTransition!(createTransitionProps("split-wipe", {
        ...instance.params,
        ...overrides,
      })),
    );

    expect(render({ mode: "push-pull" })).not.toBe(render({ mode: "split-wipe" }));
    expect(render({ direction: "left" })).not.toBe(render({ direction: "right" }));
    expect(render({ easing: "linear" })).not.toBe(render({ easing: "ease-in" }));
    expect(render({ softness: 0 })).not.toBe(render({ softness: 24 }));
    expect(render({ accentColor: "#ef4444" })).toContain("#ef4444");
    expect(render({ splitCount: 4 }).match(/data-transition-segment=/g)).toHaveLength(4);
  });
});
