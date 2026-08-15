import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
  validateEffectFamilyParams,
} from "./effect-family";
import type { EffectFamilyDefinition } from "./types";
import "./registry";

describe("特效族注册表", () => {
  it("注册启动时可用的当前特效族和三种顶层类型", () => {
    // 中文注释：目录只暴露当前特效族，首次发布前不再混入旧模板兼容条目。
    expect(listEffectFamilies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "directional-transition", category: "transition" }),
        expect.objectContaining({ id: "checklist-steps", category: "information-overlay" }),
        expect.objectContaining({ id: "hand-drawn-emphasis", category: "decorative-animation" }),
        expect.objectContaining({ id: "arrow-guidance", category: "decorative-animation" }),
        expect.objectContaining({ id: "focus-scan", category: "decorative-animation" }),
        expect.objectContaining({ id: "geometric-particles", category: "decorative-animation" }),
        expect.objectContaining({ id: "title-layer", category: "information-overlay" }),
        expect.objectContaining({ id: "emphasis-card", category: "information-overlay" }),
        expect.objectContaining({ id: "quote-comment", category: "information-overlay" }),
        expect.objectContaining({ id: "tag-status", category: "information-overlay" }),
        expect.objectContaining({ id: "lower-third", category: "information-overlay" }),
        expect.objectContaining({ id: "data-number", category: "information-overlay" }),
        expect.objectContaining({ id: "comparison-conclusion", category: "information-overlay" }),
      ]),
    );
  });

  it("信息叠加目录达到当前阶段的八个特效族和二十二个起始样式", () => {
    const families = listEffectFamilies({ category: "information-overlay" });

    expect(families).toHaveLength(8);
    expect(families.reduce((count, family) => count + family.startingStyles.length, 0)).toBe(22);
  });

  it("支持按分类过滤当前特效族摘要", () => {
    const families = listEffectFamilies({ category: "decorative-animation" });

    expect(families).toHaveLength(4);
    expect(families).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hand-drawn-emphasis" }),
      expect.objectContaining({ id: "arrow-guidance" }),
      expect.objectContaining({ id: "focus-scan" }),
      expect.objectContaining({ id: "geometric-particles" }),
    ]));
  });

  it("按特效族 ID 和当前版本查找声明", () => {
    expect(getEffectFamily("emphasis-card", 1)).toMatchObject({
      id: "emphasis-card",
      version: 1,
    });
  });

  it("拒绝重复的特效族 ID 和版本", () => {
    const family = getEffectFamily("emphasis-card", 1);

    expect(() => registerEffectFamily(family)).toThrow(/重复/);
  });

  it("通过特效族深模块归一化参数并使用声明默认值兜底", () => {
    const family = getEffectFamily("emphasis-card", 1);
    const result = validateEffectFamilyParams(family, {
      text: "重点",
      cardColor: "不是颜色",
      unexpected: "不会进入渲染输入",
    });

    expect(result.params).toMatchObject({
      text: "重点",
      cardColor: "#111827",
    });
    expect(result.params).not.toHaveProperty("unexpected");
  });

  it("所有当前特效族都能生成可渲染的 React 节点", () => {
    const canvas = { width: 1080, height: 1920 };

    for (const summary of listEffectFamilies()) {
      const family = getEffectFamily(summary.id, summary.version);
      const styleId = summary.startingStyles[0].id;
      const instance = createEffectFamilyInstance(family, styleId, "9:16");
      const input = createEffectRenderInput({
        familyId: family.id,
        version: family.version,
        startingStyleId: styleId,
        aspectRatio: "9:16",
        frame: 10,
        fps: 30,
        width: canvas.width,
        height: canvas.height,
        durationInFrames: instance.durationInFrames,
        params: instance.params,
      });

      expect(family.render(input.renderProps)).toBeTruthy();
    }
  });

  it("当前特效族摘要包含用途与视觉方向，但不暴露渲染实现和默认参数", () => {
    const family = getEffectFamily("emphasis-card", 1);
    const summary = listEffectFamilies({ text: family.name }).find((item) => item.id === family.id);

    expect(summary).toMatchObject({
      purposeTags: expect.arrayContaining(["重点标注"]),
      visualDirections: expect.arrayContaining(["简洁信息"]),
    });
    expect(summary).not.toHaveProperty("render");
    expect(summary?.startingStyles[0]).not.toHaveProperty("defaultParams");
  });

  it("当前特效族通过统一渲染输入生成稳定可观察的节点", () => {
    const family = getEffectFamily("emphasis-card", 1);
    const instance = createEffectFamilyInstance(family, "solid-card", "16:9");
    const input = createEffectRenderInput({
      familyId: family.id,
      version: family.version,
      startingStyleId: "solid-card",
      aspectRatio: "16:9",
      frame: 24,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: instance.durationInFrames,
      params: instance.params,
    });

    expect(renderToStaticMarkup(family.render(input.renderProps))).toContain(
      "data-template-id=\"" + family.id + "\"",
    );
  });

  it("可以注册新的当前特效族声明并按用途查询", () => {
    const family: EffectFamilyDefinition = {
      id: "registry-family-fixture",
      version: 1,
      category: "decorative-animation",
      name: "注册表族测试",
      description: "验证当前注册表可以添加新的特效族声明。",
      purposeTags: ["highlight"],
      visualDirections: ["tech-data"],
      defaultDurationInFrames: 24,
      parameters: [],
      startingStyles: [{
        id: "default",
        name: "默认",
        visualDirection: "tech-data",
        defaultParams: {},
      }],
      aspectRatioDefaults: {},
      render: () => createElement("span"),
    };
    registerEffectFamily(family);

    expect(listEffectFamilies({ purposeTag: "highlight" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: family.id, version: family.version })]),
    );
    expect(getEffectFamily(family.id, family.version)).toMatchObject({
      defaultDurationInFrames: family.defaultDurationInFrames,
    });
  });
});
