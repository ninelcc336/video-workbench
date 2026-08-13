import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  switchStartingStyle,
  validateEffectFamilyParams,
} from "../../domain/templates/effect-family";
import type { AnimationStageValue, EffectFamilyDefinition } from "../../domain/templates/types";
import "../../domain/templates/registry";

const FAMILY_ID = "hand-drawn-emphasis";
const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
const STYLES = ["underline", "highlighter", "circle", "box"] as const;
const FRAME_STAGES = [
  { name: "enter", frame: 0 },
  { name: "middle", frame: 71 },
  { name: "exit", frame: 143 },
] as const;

/** 中文注释：测试只通过注册表按稳定族身份查找声明，不直接依赖渲染模块内部默认值。 */
function getFamily(): EffectFamilyDefinition {
  return getEffectFamily(FAMILY_ID, 1);
}

/** 中文注释：为每种首阶段画幅提供真实视口尺寸，避免方形用例退化成横屏画布。 */
function getViewport(aspectRatio: "16:9" | "9:16" | "1:1"): { width: number; height: number } {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

/** 中文注释：构造固定画幅的统一渲染输入，测试只观察公共特效族接口的结果。 */
function createRenderProps(
  startingStyleId: string,
  params: Record<string, unknown> | undefined,
  frame: number,
  randomSeed: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
) {
  const family = getFamily();
  const instance = createEffectFamilyInstance(family, startingStyleId, aspectRatio);
  const viewport = getViewport(aspectRatio);
  return createEffectRenderInput({
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
}

/** 中文注释：通过公共 render 接口取得 React 节点；测试不依赖内部 DOM、data 属性或 HTML 序列化格式。 */
function renderEffect(
  startingStyleId: string,
  params: Record<string, unknown> = {},
  frame = 48,
  randomSeed = "hand-drawn-test-seed",
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
): ReactNode {
  const input = createRenderProps(startingStyleId, params, frame, randomSeed, aspectRatio);
  return getFamily().render(input.renderProps);
}

/** 中文注释：读取已生成的固定帧并统计非黑色像素，守住“固定帧不得空白”的视觉质量门槛。 */
function countVisiblePixels(path: string): number {
  const png = PNG.sync.read(readFileSync(path));
  let visiblePixels = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    if (red !== 0 || green !== 0 || blue !== 0) visiblePixels += 1;
  }
  return visiblePixels;
}

describe("手绘重点标注特效族", () => {
  it("注册四个起始样式并为每个公开参数提供说明", () => {
    const family = getFamily();

    expect(family.category).toBe("decorative-animation");
    expect(family.startingStyles.map((style) => style.id)).toEqual([...STYLES]);
    expect(family.parameters.map((parameter) => parameter.key)).toEqual(
      expect.arrayContaining([
        "position",
        "size",
        "rotation",
        "shape",
        "color",
        "strokeWidth",
        "roughness",
        "pathDirection",
        "drawDuration",
        "randomSeed",
        "stages",
      ]),
    );
    expect(family.parameters.every((parameter) => Boolean(parameter.description?.trim()))).toBe(true);
  });

  it("为三种画幅创建完整且独立的默认布局", () => {
    const family = getFamily();
    const wide = createEffectFamilyInstance(family, "underline", "16:9");
    const portrait = createEffectFamilyInstance(family, "underline", "9:16");
    const square = createEffectFamilyInstance(family, "underline", "1:1");

    expect(wide.params.position).not.toEqual(portrait.params.position);
    expect(portrait.params.size).not.toEqual(square.params.size);
    expect(wide.params.position).toEqual({ x: 0.5, y: 0.68 });
    expect(portrait.params.position).toEqual({ x: 0.5, y: 0.62 });
    expect(square.params.position).toEqual({ x: 0.5, y: 0.6 });
  });

  it("四个样式都通过公共渲染入口返回可区分的节点", () => {
    for (const aspectRatio of ASPECT_RATIOS) {
      const rendered = STYLES.map((styleId) => renderEffect(styleId, {}, 48, "hand-drawn-test-seed", aspectRatio));

      rendered.forEach((node) => expect(node).toBeTruthy());
      for (let left = 0; left < rendered.length; left += 1) {
        for (let right = left + 1; right < rendered.length; right += 1) {
          expect(rendered[left]).not.toEqual(rendered[right]);
        }
      }
    }
  });

  it("相同随机种子重复求值保持稳定，不同种子会改变公共渲染输入", () => {
    const staticStages: AnimationStageValue = {};
    const first = renderEffect("circle", { stages: staticStages, drawDuration: 1 }, 32, "fixed-seed");
    const repeated = renderEffect("circle", { stages: staticStages, drawDuration: 1 }, 32, "fixed-seed");
    const different = renderEffect("circle", { stages: staticStages, drawDuration: 1 }, 32, "other-seed");

    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
  });

  it("路径方向、绘制时长、旋转和粗糙度都会产生可观察渲染变化", () => {
    const base = renderEffect("underline", {}, 8);
    const changed = renderEffect("underline", {
      pathDirection: "reverse",
      drawDuration: 42,
      rotation: 18,
      roughness: 0.8,
      strokeWidth: 14,
    }, 8);

    expect(changed).not.toEqual(base);
  });

  it("每个公开参数都能通过统一渲染入口改变可观察结果", () => {
    const family = getFamily();
    const stages = family.parameters.find((parameter) => parameter.key === "stages")?.defaultValue as AnimationStageValue;
    const changedStages: AnimationStageValue = {
      ...stages,
      enter: stages.enter === undefined
        ? undefined
        : { ...stages.enter, durationInFrames: 6 },
    };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["position", { position: { x: 0.2, y: 0.3 } }],
      ["size", { size: { width: 0.72, height: 0.28 } }],
      ["rotation", { rotation: 18 }],
      ["shape", { shape: "circle" }],
      ["color", { color: "#22c55e" }],
      ["strokeWidth", { strokeWidth: 14 }],
      ["roughness", { roughness: 0.8 }],
      ["pathDirection", { pathDirection: "reverse" }],
      ["drawDuration", { drawDuration: 48 }],
      ["randomSeed", { randomSeed: "another-seed" }],
      ["stages", { stages: changedStages }],
    ];

    for (const [parameterKey, overrides] of cases) {
      expect(renderEffect("underline", overrides, 8), parameterKey).not.toEqual(renderEffect("underline", {}, 8));
    }
  });

  it("入场绘制、持续微动和出场阶段都能按任意帧稳定求值", () => {
    const family = getFamily();
    const stages = family.parameters.find((parameter) => parameter.key === "stages")?.defaultValue as AnimationStageValue;
    const enter = renderEffect("box", { stages }, 0);
    const middle = renderEffect("box", { stages }, 72);
    const exit = renderEffect("box", { stages }, 143);

    expect(enter).toBeTruthy();
    expect(middle).toBeTruthy();
    expect(exit).toBeTruthy();
    expect(enter).not.toEqual(middle);
    expect(middle).not.toEqual(exit);
  });

  it("持续阶段强度会控制手绘微动", () => {
    const family = getFamily();
    const stages = family.parameters.find((parameter) => parameter.key === "stages")?.defaultValue as AnimationStageValue;
    const noPulse = renderEffect("circle", {
      stages: {
        ...stages,
        sustain: stages.sustain === undefined ? undefined : { ...stages.sustain, intensity: 0 },
      },
    }, 72);
    const pulsing = renderEffect("circle", { stages }, 72);

    expect(pulsing).not.toEqual(noPulse);
  });

  it("固定帧基线在四个样式和三种画幅下均保留可见标注", () => {
    const baselineRoot = resolve(
      process.cwd(),
      "tests/visual-baselines/effect-families/hand-drawn-emphasis/v1",
    );

    for (const styleId of STYLES) {
      for (const aspectRatio of ASPECT_RATIOS) {
        for (const stage of FRAME_STAGES) {
          const path = resolve(
            baselineRoot,
            styleId,
            aspectRatio.replace(":", "-"),
            stage.name,
            "default",
            "all.png",
          );
          expect(existsSync(path), path).toBe(true);
          expect(countVisiblePixels(path), path).toBeGreaterThan(0);
        }
      }
    }
  });

  it("高级越界布局保留用户值并返回非阻断警告", () => {
    const result = validateEffectFamilyParams(getFamily(), {
      position: { x: -0.2, y: 1.2 },
      size: { width: 1.2, height: 1.2 },
    });

    expect(result.valid).toBe(true);
    expect(result.params.position).toEqual({ x: -0.2, y: 1.2 });
    expect(result.params.size).toEqual({ width: 1.2, height: 1.2 });
    expect(result.warnings.map((warning) => warning.key)).toEqual(
      expect.arrayContaining(["position", "size"]),
    );
  });

  it("切换起始样式时保留位置、尺寸和片段时长，只替换手绘表现参数", () => {
    const family = getFamily();
    const source = createEffectFamilyInstance(family, "underline", "9:16");
    const switched = switchStartingStyle(
      family,
      {
        ...source,
        durationInFrames: 96,
        params: {
          ...source.params,
          position: { x: 0.22, y: 0.74 },
          size: { width: 0.4, height: 0.16 },
          color: "#123456",
        },
      },
      "circle",
    );

    expect(switched.instance).toMatchObject({
      startingStyleId: "circle",
      durationInFrames: 96,
      params: {
        position: { x: 0.22, y: 0.74 },
        size: { width: 0.4, height: 0.16 },
        color: "#fb7185",
      },
    });
    expect(switched.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "color" }),
        expect.objectContaining({ key: "rotation" }),
      ]),
    );
  });
});
