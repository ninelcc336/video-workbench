import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
  switchStartingStyle,
  validateEffectFamilyParams,
} from "./effect-family";
import type { EffectFamilyDefinition } from "./types";

const contractFamily: EffectFamilyDefinition = {
  id: "contract-fixture",
  version: 1,
  category: "information-overlay",
  name: "契约测试族",
  description: "用于验证特效族公共接口的最小声明。",
  purposeTags: ["steps", "highlight"],
  visualDirections: ["concise-information"],
  defaultDurationInFrames: 30,
  parameters: [
    {
      key: "title",
      label: "标题",
      type: "multiline-text",
      defaultValue: "默认标题",
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
      level: "basic",
      styleSwitch: "preserve",
      safety: "warn-on-overflow",
    },
    {
      key: "accent",
      label: "强调色",
      type: "color",
      defaultValue: "#14b8a6",
      group: "appearance",
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
      key: "gradient",
      label: "渐变",
      type: "gradient",
      defaultValue: {
        angle: 90,
        stops: [
          { offset: 0, color: "#14b8a6" },
          { offset: 1, color: "#38bdf8" },
        ],
      },
      minStops: 2,
      maxStops: 4,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "spacing",
      label: "间距",
      type: "spacing",
      defaultValue: { top: 8, right: 12, bottom: 8, left: 12 },
      min: 0,
      max: 48,
      group: "layout",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "font",
      label: "字体",
      type: "font",
      defaultValue: "sans",
      options: [{ value: "sans", label: "无衬线" }],
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "icon",
      label: "图标",
      type: "icon",
      defaultValue: "check",
      options: [{ value: "check", label: "勾选" }],
      group: "content",
      level: "advanced",
      styleSwitch: "preserve",
    },
    {
      key: "stages",
      label: "动画阶段",
      type: "animation-stage",
      stages: ["enter", "sustain", "exit"],
      defaultValue: {
        enter: { durationInFrames: 4, delayInFrames: 0, direction: "left", easing: "ease-out", intensity: 1, stagger: 0 },
        sustain: { durationInFrames: 10, delayInFrames: 0, direction: "none", easing: "linear", intensity: 1, stagger: 0 },
        exit: { durationInFrames: 4, delayInFrames: 0, direction: "right", easing: "ease-in", intensity: 1, stagger: 0 },
      },
      group: "animation",
      level: "advanced",
      styleSwitch: "replace",
    },
  ],
  startingStyles: [
    {
      id: "clean",
      name: "简洁",
      visualDirection: "concise-information",
      defaultParams: { accent: "#14b8a6" },
      aspectRatioDefaults: { "9:16": { position: { x: 0.5, y: 0.7 } } },
    },
    {
      id: "tech",
      name: "科技",
      visualDirection: "tech-data",
      defaultParams: { accent: "#38bdf8" },
      parameterConstraints: { items: { maxItems: 1 } },
    },
  ],
  aspectRatioDefaults: {
    "16:9": { position: { x: 0.5, y: 0.6 } },
    "9:16": { position: { x: 0.5, y: 0.65 } },
    "1:1": { position: { x: 0.5, y: 0.55 } },
  },
  render: (props) => createElement("div", { "data-effect-family": props.effectFamilyId }),
};

describe("特效族公共契约", () => {
  it("按 ID、类型、用途标签、视觉方向和文本查询特效族", () => {
    // 中文注释：目录查询是编辑器和模板库共同依赖的入口，不能让调用方读取注册表内部数据结构。
    registerEffectFamily(contractFamily);

    expect(getEffectFamily("contract-fixture", 1)).toMatchObject({
      id: "contract-fixture",
      version: 1,
    });
    expect(listEffectFamilies({ category: "information-overlay" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contract-fixture" })]),
    );
    expect(listEffectFamilies({ purposeTag: "steps" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contract-fixture" })]),
    );
    expect(listEffectFamilies({ visualDirection: "concise-information" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contract-fixture" })]),
    );
    expect(listEffectFamilies({ text: "契约" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contract-fixture" })]),
    );
    const summary = listEffectFamilies({ text: "契约" }).find((family) => family.id === "contract-fixture");
    expect(summary?.startingStyles[0]).toMatchObject({ id: "clean", name: "简洁" });
    expect(summary?.startingStyles[0]).not.toHaveProperty("defaultParams");
  });

  it("按画幅合并族默认值和起始样式默认值，创建完整实例参数", () => {
    const instance = createEffectFamilyInstance("contract-fixture", "clean", "9:16");

    expect(instance).toMatchObject({
      effectFamilyId: "contract-fixture",
      version: 1,
      startingStyleId: "clean",
      aspectRatio: "9:16",
      durationInFrames: 30,
      params: {
        title: "默认标题",
        position: { x: 0.5, y: 0.7 },
        accent: "#14b8a6",
      },
    });
  });

  it("归一化新版参数并区分阻断错误与非阻断警告", () => {
    const valid = validateEffectFamilyParams("contract-fixture", {
      title: "新的标题",
      items: [{ label: "第一项", ignored: "不会进入渲染输入" }],
      gradient: { angle: 45, stops: [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#000000" }] },
      spacing: { top: 4, right: 8, bottom: 4, left: 8 },
      font: "sans",
      icon: "check",
      stages: {
        enter: { durationInFrames: 3, delayInFrames: 0, direction: "left", easing: "ease-out", intensity: 1, stagger: 0 },
      },
    });

    expect(valid.valid).toBe(true);
    expect(valid.params.items).toEqual([{ label: "第一项" }]);
    expect(valid.params).not.toHaveProperty("ignored");

    const invalid = validateEffectFamilyParams("contract-fixture", {
      title: 123,
      items: "不是数组",
      gradient: { angle: Number.NaN, stops: [] },
      spacing: { top: 4, right: 80, bottom: 4, left: 8 },
      font: "remote-font-path",
      icon: "unknown-icon",
      stages: { enter: { durationInFrames: -1 } },
      unknown: "丢弃",
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((error) => error.key)).toEqual(
      expect.arrayContaining(["title", "items", "gradient", "spacing", "font", "icon", "stages"]),
    );
    expect(invalid.warnings).toEqual([
      expect.objectContaining({ key: "unknown", code: "unknown_parameter" }),
    ]);
    expect(invalid.params.items).toEqual([{ label: "默认条目" }]);

    const overflow = validateEffectFamilyParams("contract-fixture", {
      position: { x: 1.2, y: -0.1 },
    });
    expect(overflow.valid).toBe(true);
    expect(overflow.params.position).toEqual({ x: 1.2, y: -0.1 });
    expect(overflow.warnings).toEqual([
      expect.objectContaining({ key: "position", code: "layout_overflow" }),
    ]);
  });

  it("切换起始样式时保留内容和位置，并报告目标样式的容量警告", () => {
    const source = createEffectFamilyInstance("contract-fixture", "clean", "9:16");
    const switched = switchStartingStyle(
      "contract-fixture",
      {
        ...source,
        params: {
          ...source.params,
          title: "用户自己的标题",
          items: [{ label: "第一项" }, { label: "第二项" }],
          position: { x: 0.2, y: 0.8 },
        },
      },
      "tech",
    );

    expect(switched.instance).toMatchObject({
      startingStyleId: "tech",
      aspectRatio: "9:16",
      durationInFrames: 30,
      params: {
        title: "用户自己的标题",
        items: [{ label: "第一项" }, { label: "第二项" }],
        position: { x: 0.2, y: 0.8 },
        accent: "#38bdf8",
      },
    });
    expect(switched.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "accent" })]),
    );
    expect(switched.warnings).toEqual([
      expect.objectContaining({ key: "items", code: "content_capacity" }),
    ]);
  });

  it("样式切换会按实例时长压缩目标动画阶段", () => {
    const source = {
      ...createEffectFamilyInstance("contract-fixture", "clean", "16:9"),
      durationInFrames: 5,
    };
    const switched = switchStartingStyle("contract-fixture", source, "tech");
    const stages = switched.instance.params.stages as Record<string, { durationInFrames: number; delayInFrames: number }>;

    expect(Object.values(stages).reduce(
      (total, phase) => total + phase.durationInFrames + phase.delayInFrames,
      0,
    )).toBeLessThanOrEqual(5);
    expect(switched.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "stages", code: "animation_duration_compressed" })]),
    );
  });

  it("确认采用画幅布局时只替换目标样式声明的位置信息", () => {
    const source = createEffectFamilyInstance("contract-fixture", "clean", "9:16");
    const switched = switchStartingStyle(
      "contract-fixture",
      {
        ...source,
        params: {
          ...source.params,
          title: "保留的标题",
          position: { x: 0.2, y: 0.8 },
        },
      },
      "tech",
      { useAspectRatioLayout: true },
    );

    expect(switched.aspectRatioLayoutKeys).toEqual(["position"]);
    expect(switched.useAspectRatioLayout).toBe(true);
    expect(switched.instance.params).toMatchObject({
      title: "保留的标题",
      position: { x: 0.5, y: 0.65 },
    });
  });

  it("为任意帧生成可重复且只包含安全参数的渲染输入", () => {
    const request = {
      familyId: "contract-fixture",
      version: 1,
      startingStyleId: "clean",
      aspectRatio: "9:16" as const,
      frame: 99,
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 10,
      randomSeed: "project-seed",
      params: { title: "固定标题", unexpected: "不会进入渲染输入" },
    };
    const first = createEffectRenderInput(request);
    const second = createEffectRenderInput(request);

    expect(first).toEqual(second);
    expect(first.renderProps).toMatchObject({
      frame: 9,
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 10,
      effectFamilyId: "contract-fixture",
      effectFamilyVersion: 1,
      startingStyleId: "clean",
      aspectRatio: "9:16",
      randomSeed: "project-seed",
      params: { title: "固定标题" },
    });
    expect(first.renderProps.params).not.toHaveProperty("unexpected");
    expect(first.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "stages", code: "animation_duration_compressed" })]),
    );
    const stages = first.renderProps.params.stages as Record<string, { durationInFrames: number; delayInFrames: number }>;
    expect(Object.values(stages).reduce(
      (total, phase) => total + phase.durationInFrames + phase.delayInFrames,
      0,
    )).toBeLessThanOrEqual(10);
  });
});
