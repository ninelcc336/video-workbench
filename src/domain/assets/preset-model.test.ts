import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EffectClip } from "../project/model";
import { createEditorStore } from "../editor/editor-store";
import { getEffectFamily, registerEffectFamily } from "../templates/effect-family";
import type { EffectFamilyDefinition } from "../templates/types";
import "../templates/registry";
import {
  applyPreset,
  buildExportSettings,
  createPreset,
  serializePreset,
  type ExportPresetName,
} from "./preset-model";

const effectClip: EffectClip = {
  id: "effect-1",
  templateId: "emphasis-card",
  templateVersion: 1,
  effectFamilyId: "emphasis-card",
  startingStyleId: "solid-card",
  placement: { type: "range" },
  trackId: "effects-1",
  fromFrame: 0,
  durationInFrames: 30,
  params: { text: "原文", position: { x: 0.5, y: 0.5 } },
};

const presetFamily: EffectFamilyDefinition = {
  id: "preset-scope-fixture",
  version: 1,
  category: "information-overlay",
  name: "预设范围测试族",
  description: "验证样式预设与完整预设的参数边界。",
  purposeTags: ["测试"],
  visualDirections: ["简洁信息"],
  defaultDurationInFrames: 30,
  parameters: [
    {
      key: "text",
      label: "文字",
      type: "text",
      defaultValue: "默认文字",
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
    },
    {
      key: "color",
      label: "颜色",
      type: "color",
      defaultValue: "#111827",
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
  ],
  startingStyles: [{ id: "default", name: "默认", visualDirection: "简洁信息", defaultParams: {} }],
  aspectRatioDefaults: {},
  render: (props) => createElement("div", { "data-family": props.effectFamilyId }),
};

registerEffectFamily(presetFamily);

describe("个人预设模型", () => {
  it("只序列化模板引用、名称和深拷贝后的参数", () => {
    const params = { text: "知识点", position: { x: 0.5, y: 0.8 } };
    const preset = createPreset("preset-1", "emphasis-card", 1, "知识点卡片", params, "full", "emphasis-card");

    params.position.x = 0;

    const serialized = serializePreset(preset);
    expect(serialized).toMatchObject({
      effectFamilyId: "emphasis-card",
      templateId: "emphasis-card",
      templateVersion: 1,
      name: "知识点卡片",
      scope: "full",
    });
    expect(Object.keys(serialized.params)).toEqual(
      getEffectFamily("emphasis-card", 1).parameters.map((parameter) => parameter.key),
    );
    expect(serialized.params).toMatchObject({ text: "知识点", position: { x: 0.5, y: 0.8 } });
    expect(JSON.stringify(serialized)).not.toContain("mediaId");
  });

  it("完整预设缺少字段时补齐当前族声明的默认参数", () => {
    const preset = createPreset(
      "complete-defaults",
      presetFamily.id,
      1,
      "完整卡片",
      { text: "固定文案", position: { x: 0.4, y: 0.6 } },
      "full",
      presetFamily.id,
    );

    expect(preset.params).toEqual({
      text: "固定文案",
      position: { x: 0.4, y: 0.6 },
      color: "#111827",
    });
  });

  it("通过 EditorStore 公共命令应用预设，并且不污染预设参数", () => {
    const preset = createPreset("preset-1", "emphasis-card", 1, "知识点卡片", {
      text: "新文案",
      position: { x: 0.2, y: 0.3 },
    }, "full", "emphasis-card");
    const store = createEditorStore({
      ...createEmptyProject(),
      effectClips: [effectClip],
    });

    applyPreset(store, preset, effectClip.id);
    const snapshot = store.getSnapshot();
    expect(snapshot.effectClips[0].params).toEqual(preset.params);
    snapshot.effectClips[0].params.text = "外部修改";
    expect(preset.params.text).toBe("新文案");

    store.undo();
    expect(store.getSnapshot().effectClips[0].params).toEqual(effectClip.params);
  });

  it("预设特效族或版本不兼容时不修改当前片段，也不新增撤销历史", () => {
    const incompatiblePreset = createPreset(
      "incompatible-preset",
      presetFamily.id,
      1,
      "不兼容预设",
      { text: "不应写入" },
      "full",
      presetFamily.id,
    );
    const store = createEditorStore({
      ...createEmptyProject(),
      effectClips: [effectClip],
    });
    const before = store.getSnapshot();

    expect(applyPreset(store, incompatiblePreset, effectClip.id)).toBe(false);
    expect(store.getSnapshot()).toEqual(before);
    store.undo();
    expect(store.getSnapshot()).toEqual(before);
  });

  it("样式预设只保存表现参数，套用时保留当前内容并进入一次撤销历史", () => {
    const clip: EffectClip = {
      id: "preset-effect-1",
      templateId: presetFamily.id,
      templateVersion: 1,
      effectFamilyId: presetFamily.id,
      startingStyleId: "default",
      placement: { type: "range" },
      trackId: "effects-1",
      fromFrame: 8,
      durationInFrames: 24,
      params: { text: "当前文案", position: { x: 0.2, y: 0.8 }, color: "#111827" },
    };
    const stylePreset = createPreset(
      "style-preset-1",
      presetFamily.id,
      1,
      "品牌样式",
      { text: "不应覆盖", position: { x: 0.7, y: 0.3 }, color: "#38bdf8" },
      "style",
      presetFamily.id,
    );
    const store = createEditorStore({ ...createEmptyProject(), effectClips: [clip] });

    expect(serializePreset(stylePreset)).toEqual({
      effectFamilyId: presetFamily.id,
      templateId: presetFamily.id,
      templateVersion: 1,
      name: "品牌样式",
      scope: "style",
      params: { position: { x: 0.7, y: 0.3 }, color: "#38bdf8" },
    });

    applyPreset(store, stylePreset, clip.id);
    expect(store.getSnapshot().effectClips[0].params).toEqual({
      text: "当前文案",
      position: { x: 0.7, y: 0.3 },
      color: "#38bdf8",
    });
    store.undo();
    expect(store.getSnapshot().effectClips[0]).toEqual(clip);
  });

  it("创建样式预设时不会持久化文字内容", () => {
    const preset = createPreset(
      "legacy-style-preset",
      "emphasis-card",
      1,
      "旧版品牌样式",
      { text: "当前文案", cardColor: "#38bdf8", position: { x: 0.2, y: 0.8 } },
      "style",
      "emphasis-card",
    );

    expect(preset.params).not.toHaveProperty("text");
    expect(preset.params).toMatchObject({ cardColor: "#38bdf8", position: { x: 0.2, y: 0.8 } });
    expect(Object.keys(preset.params)).toEqual(
      getEffectFamily("emphasis-card", 1).parameters
        .filter((parameter) => parameter.group !== "content")
        .map((parameter) => parameter.key),
    );
  });

  it("无法解析特效族时拒绝创建样式预设，避免把未知内容写入样式范围", () => {
    expect(() => createPreset(
      "unknown-style-preset",
      "missing-effect-family",
      1,
      "未知样式",
      { text: "不能安全判断" },
      "style",
      "missing-effect-family",
    )).toThrow("未找到特效族");
  });

  it.each([
    ["vertical", 1080, 1920],
    ["horizontal", 1920, 1080],
    ["square", 1080, 1080],
  ] as const)("生成%s导出规格", (preset: ExportPresetName, width, height) => {
    expect(buildExportSettings(preset, createEmptyProject())).toEqual({
      format: "mp4",
      width,
      height,
      fps: 30,
    });
  });
});
// 中文注释：测试个人预设的公开行为和参数隔离。
