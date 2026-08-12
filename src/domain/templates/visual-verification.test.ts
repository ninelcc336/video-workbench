import { describe, expect, it } from "vitest";
import {
  buildVisualVerificationMatrix,
  selectVisualVerificationTargets,
  type VisualVerificationScope,
} from "./visual-verification";
import { registerEffectFamily } from "./effect-family";
import type { EffectFamilyDefinition } from "./types";

// 中文注释：这个夹具故意包含边界、结构化内容和高级布局参数，作为矩阵 seam 的独立事实来源。
const fixtureFamily: EffectFamilyDefinition = {
  id: "visual-verification-fixture",
  version: 1,
  category: "information-overlay",
  name: "视觉验证夹具",
  description: "用于验证固定帧矩阵的最小特效族。",
  purposeTags: ["steps"],
  visualDirections: ["concise-information"],
  defaultDurationInFrames: 12,
  parameters: [
    {
      key: "headline",
      label: "标题",
      type: "multiline-text",
      defaultValue: "默认标题",
      maxLength: 40,
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "amount",
      label: "数值",
      type: "number",
      defaultValue: 50,
      min: 0,
      max: 100,
      group: "content",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "items",
      label: "条目",
      type: "structured-list",
      defaultValue: [{ label: "默认条目" }],
      itemSchema: [{ key: "label", label: "标签", type: "text", defaultValue: "" }],
      minItems: 1,
      maxItems: 3,
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "position",
      label: "位置",
      type: "position",
      defaultValue: { x: 0.5, y: 0.5 },
      group: "layout",
      level: "advanced",
      styleSwitch: "preserve",
      safety: "warn-on-overflow",
    },
  ],
  startingStyles: [{
    id: "fixture-style",
    name: "夹具样式",
    visualDirection: "concise-information",
    defaultParams: {},
  }],
  aspectRatioDefaults: {},
  render: () => null,
};

registerEffectFamily(fixtureFamily);

describe("特效固定帧验证矩阵", () => {
  it("支持全目录、单个特效族和单个起始样式三种范围", () => {
    const catalogTargets = selectVisualVerificationTargets({ kind: "catalog" });
    const familyTargets = selectVisualVerificationTargets({
      kind: "family",
      familyId: fixtureFamily.id,
    });
    const styleScope: VisualVerificationScope = {
      kind: "style",
      familyId: fixtureFamily.id,
      startingStyleId: "fixture-style",
    };
    const styleTargets = selectVisualVerificationTargets(styleScope);

    expect(catalogTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: expect.objectContaining({ id: fixtureFamily.id }) }),
    ]));
    expect(familyTargets).toHaveLength(1);
    expect(familyTargets[0].style.id).toBe("fixture-style");
    expect(styleTargets).toEqual(familyTargets);
  });

  it("为横竖画幅生成入场、中段、出场帧，并为方形只生成中段帧", () => {
    const cases = buildVisualVerificationMatrix({
      scope: { kind: "family", familyId: fixtureFamily.id },
    }).filter((item) => item.scenario === "default");

    expect(cases.filter((item) => item.aspectRatio === "16:9").map((item) => item.frameStage)).toEqual([
      "enter",
      "middle",
      "exit",
    ]);
    expect(cases.filter((item) => item.aspectRatio === "9:16").map((item) => item.frameStage)).toEqual([
      "enter",
      "middle",
      "exit",
    ]);
    expect(cases.filter((item) => item.aspectRatio === "1:1").map((item) => item.frameStage)).toEqual([
      "middle",
    ]);
    const fixedFrameCase = cases.find((item) => item.aspectRatio === "9:16" && item.frameStage === "exit");
    expect(fixedFrameCase?.renderProps.randomSeed).toBe("effect-visual-verification-v1");
  });

  it("覆盖默认、最小、最大、长文本、最大条目和高级越界场景", () => {
    const cases = buildVisualVerificationMatrix({
      scope: { kind: "style", familyId: fixtureFamily.id, startingStyleId: "fixture-style" },
    });
    const fixtureCases = cases.filter((item) => item.aspectRatio === "16:9" && item.frameStage === "middle");

    expect(new Set(fixtureCases.map((item) => item.scenario))).toEqual(new Set([
      "default",
      "minimum",
      "maximum",
      "long-text",
      "max-structured-items",
      "advanced-overflow",
    ]));
    expect(fixtureCases.find((item) => item.scenario === "minimum" && item.parameterKey === "amount")?.renderProps.params.amount).toBe(0);
    expect(fixtureCases.find((item) => item.scenario === "maximum" && item.parameterKey === "amount")?.renderProps.params.amount).toBe(100);
    expect(String(fixtureCases.find((item) => item.scenario === "long-text")?.renderProps.params.headline)).toContain("English");
    expect((fixtureCases.find((item) => item.scenario === "max-structured-items")?.renderProps.params.items as unknown[]).length).toBe(3);
    expect(fixtureCases.find((item) => item.scenario === "advanced-overflow")?.renderProps.params.position).toEqual({ x: -0.12, y: 1.12 });
    expect(fixtureCases.find((item) => item.scenario === "advanced-overflow")?.warnings).toEqual([
      expect.objectContaining({ code: "layout_overflow" }),
    ]);
    expect(cases.filter((item) => item.scenario !== "default").every((item) => item.frameStage === "middle")).toBe(true);
  });

  it("失败时给出包含范围和起始样式的明确错误", () => {
    expect(() => selectVisualVerificationTargets({
      kind: "style",
      familyId: fixtureFamily.id,
      startingStyleId: "missing-style",
    })).toThrow("视觉验证找不到起始样式");
  });
});
