import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  validateEffectFamilyParams,
} from "../../domain/templates/effect-family";
import type { AnimationStageValue, EffectFamilyDefinition } from "../../domain/templates/types";
import "../../domain/templates/registry";

const DECORATIVE_FAMILY_IDS = [
  "hand-drawn-emphasis",
  "arrow-guidance",
  "focus-scan",
  "geometric-particles",
] as const;

const VIEWPORTS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
} as const;

/** 中文注释：测试只通过特效族公共接口构造渲染输入，避免把参数默认值复制进测试形成第二套实现。 */
function renderFamily(
  family: EffectFamilyDefinition,
  startingStyleId: string,
  params: Record<string, unknown> = {},
  frame = 48,
  aspectRatio: keyof typeof VIEWPORTS = "16:9",
  randomSeed = "decorative-family-test-seed",
): string {
  const viewport = VIEWPORTS[aspectRatio];
  const instance = createEffectFamilyInstance(family, startingStyleId, aspectRatio);
  const input = createEffectRenderInput({
    familyId: family.id,
    version: family.version,
    startingStyleId,
    aspectRatio,
    frame,
    fps: 30,
    width: viewport.width,
    height: viewport.height,
    durationInFrames: instance.durationInFrames,
    params: { ...instance.params, ...params },
    randomSeed,
  });

  return renderToStaticMarkup(family.render(input.renderProps));
}

/** 中文注释：为动画阶段参数构造只改变入场时长的独立值，证明阶段字段会影响公开渲染结果。 */
function changeEnterDuration(family: EffectFamilyDefinition): AnimationStageValue {
  const parameter = family.parameters.find((candidate) => candidate.key === "stages");
  const stages = parameter?.type === "animation-stage" ? parameter.defaultValue : {};
  return {
    ...stages,
    enter: stages.enter === undefined
      ? undefined
      : { ...stages.enter, durationInFrames: stages.enter.durationInFrames + 8 },
  };
}

describe("新增装饰动画特效族", () => {
  it("装饰动画目录包含四个特效族和十个起始样式，并移除旧漂浮气泡族", () => {
    const decorativeFamilies = listEffectFamilies({ category: "decorative-animation" });

    expect(decorativeFamilies.map((family) => family.id)).toEqual(
      expect.arrayContaining([...DECORATIVE_FAMILY_IDS]),
    );
    expect(decorativeFamilies).toHaveLength(4);
    expect(decorativeFamilies.reduce((count, family) => count + family.startingStyles.length, 0)).toBe(10);
    expect(decorativeFamilies.some((family) => family.id === "bubble-decoration")).toBe(false);
  });

  it("新增特效族声明六个起始样式和适用的确定性动画参数", () => {
    const expectations = [
      ["arrow-guidance", ["pulse-arrow", "hand-drawn-curve-arrow"], ["path", "speed", "intensity", "loop", "color", "randomSeed", "stages"]],
      ["focus-scan", ["spotlight", "scan-frame"], ["mode", "scanDirection", "speed", "intensity", "loop", "color", "randomSeed", "stages"]],
      ["geometric-particles", ["floating-bubbles", "geometric-particle-flow"], ["density", "speed", "intensity", "loop", "color", "randomSeed", "stages"]],
    ] as const;

    for (const [familyId, styles, parameterKeys] of expectations) {
      const family = getEffectFamily(familyId, 1);
      expect(family.startingStyles.map((style) => style.id)).toEqual(styles);
      expect(family.parameters.map((parameter) => parameter.key)).toEqual(
        expect.arrayContaining(["position", "size", ...parameterKeys]),
      );
      expect(family.parameters.every((parameter) => Boolean(parameter.description?.trim()))).toBe(true);
    }
  });

  it("六个起始样式在三种画幅和三个动画阶段都能产生可见且不相同的输出", () => {
    for (const familyId of DECORATIVE_FAMILY_IDS.slice(1)) {
      const family = getEffectFamily(familyId, 1);
      for (const style of family.startingStyles) {
        for (const aspectRatio of Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>) {
          const frames = [0, Math.floor(family.defaultDurationInFrames / 2), family.defaultDurationInFrames - 1]
            .map((frame) => renderFamily(family, style.id, {}, frame, aspectRatio));

          expect(frames.every((markup) => markup.length > 0), `${familyId}/${style.id}/${aspectRatio}`).toBe(true);
          expect(new Set(frames).size, `${familyId}/${style.id}/${aspectRatio}`).toBeGreaterThan(1);
        }
        expect(
          renderFamily(family, style.id, {}, 48, "16:9"),
          `${familyId}/${style.id}`,
        ).toContain(`data-effect-family="${familyId}"`);
      }
    }
  });

  it("相同随机种子稳定复现，变化种子会改变装饰路径或粒子分布", () => {
    for (const [familyId, styleId] of [
      ["arrow-guidance", "hand-drawn-curve-arrow"],
      ["focus-scan", "scan-frame"],
      ["geometric-particles", "geometric-particle-flow"],
    ] as const) {
      const family = getEffectFamily(familyId, 1);
      const first = renderFamily(family, styleId, {}, 42, "16:9", "fixed-seed");
      expect(renderFamily(family, styleId, {}, 42, "16:9", "fixed-seed")).toBe(first);
      expect(renderFamily(family, styleId, {}, 42, "16:9", "other-seed")).not.toBe(first);
    }
  });

  it("公开参数会通过统一渲染入口改变适用的装饰行为", () => {
    const cases = [
      {
        familyId: "arrow-guidance",
        styleId: "pulse-arrow",
        overrides: [
          { position: { x: 0.2, y: 0.3 } },
          { size: { width: 0.7, height: 0.3 } },
          { path: "curved" },
          { direction: "up" },
          { speed: 2.4 },
          { intensity: 0.2 },
          { loop: false },
          { color: "#ef4444" },
          { randomSeed: "changed" },
          { stages: { enter: { durationInFrames: 80, delayInFrames: 0, direction: "left", easing: "linear", intensity: 1, stagger: 0 } } },
        ],
      },
      {
        familyId: "focus-scan",
        styleId: "scan-frame",
        overrides: [
          { position: { x: 0.2, y: 0.3 } },
          { size: { width: 0.7, height: 0.3 } },
          { mode: "spotlight" },
          { scanDirection: "vertical" },
          { speed: 2.4 },
          { intensity: 0.2 },
          { loop: false },
          { color: "#ef4444" },
          { randomSeed: "changed" },
          { stages: { enter: { durationInFrames: 80, delayInFrames: 0, direction: "left", easing: "linear", intensity: 1, stagger: 0 } } },
        ],
      },
      {
        familyId: "geometric-particles",
        styleId: "floating-bubbles",
        overrides: [
          { position: { x: 0.2, y: 0.3 } },
          { size: { width: 0.7, height: 0.3 } },
          { density: 48 },
          { speed: 2.4 },
          { intensity: 0.2 },
          { loop: false },
          { color: "#ef4444" },
          { particleSize: 0.9 },
          { randomSeed: "changed" },
          { stages: { enter: { durationInFrames: 80, delayInFrames: 0, direction: "left", easing: "linear", intensity: 1, stagger: 0 } } },
        ],
      },
    ] as const;

    for (const testCase of cases) {
      const family = getEffectFamily(testCase.familyId, 1);
      const base = renderFamily(family, testCase.styleId);
      for (const override of testCase.overrides) {
        expect(renderFamily(family, testCase.styleId, override), `${testCase.familyId}/${Object.keys(override)[0]}`).not.toBe(base);
      }
    }
  });

  it("聚光区域的扫描方向会改变高光焦点的移动轴", () => {
    const family = getEffectFamily("focus-scan", 1);
    const horizontal = renderFamily(family, "spotlight", { scanDirection: "horizontal" });
    const vertical = renderFamily(family, "spotlight", { scanDirection: "vertical" });

    expect(vertical).not.toBe(horizontal);
  });

  it("几何点缀与粒子把密度限制在渲染安全上限，并保留可理解的参数错误", () => {
    const family = getEffectFamily("geometric-particles", 1);
    const result = validateEffectFamilyParams(family, { density: 999 });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ key: "density", code: "invalid_parameter" }),
    ]);
    expect(result.params.density).toBe(12);
  });

  it("三个新增族都为三种画幅声明不同的安全布局", () => {
    for (const familyId of DECORATIVE_FAMILY_IDS.slice(1)) {
      const family = getEffectFamily(familyId, 1);
      const wide = createEffectFamilyInstance(family, family.startingStyles[0].id, "16:9");
      const portrait = createEffectFamilyInstance(family, family.startingStyles[0].id, "9:16");
      const square = createEffectFamilyInstance(family, family.startingStyles[0].id, "1:1");

      expect(wide.params.position).not.toEqual(portrait.params.position);
      expect(portrait.params.size).not.toEqual(square.params.size);
    }
  });

  it("动画阶段参数会改变三个新增族的任意帧求值", () => {
    for (const [familyId, styleId] of [
      ["arrow-guidance", "pulse-arrow"],
      ["focus-scan", "spotlight"],
      ["geometric-particles", "floating-bubbles"],
    ] as const) {
      const family = getEffectFamily(familyId, 1);
      const changedStages = changeEnterDuration(family);
      expect(renderFamily(family, styleId, { stages: changedStages }, 4)).not.toBe(
        renderFamily(family, styleId, {}, 4),
      );
    }
  });
});
