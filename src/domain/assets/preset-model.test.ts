import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EffectClip } from "../project/model";
import { createEditorStore } from "../editor/editor-store";
import {
  applyPreset,
  buildExportSettings,
  createPreset,
  serializePreset,
  type ExportPresetName,
} from "./preset-model";

const effectClip: EffectClip = {
  id: "effect-1",
  templateId: "card-overlay",
  templateVersion: 1,
  trackId: "effects-1",
  fromFrame: 0,
  durationInFrames: 30,
  params: { text: "原文", position: { x: 0.5, y: 0.5 } },
};

describe("个人预设模型", () => {
  it("只序列化模板引用、名称和深拷贝后的参数", () => {
    const params = { text: "知识点", position: { x: 0.5, y: 0.8 } };
    const preset = createPreset("preset-1", "card-overlay", 1, "知识点卡片", params);

    params.position.x = 0;

    expect(serializePreset(preset)).toEqual({
      templateId: "card-overlay",
      templateVersion: 1,
      name: "知识点卡片",
      params: { text: "知识点", position: { x: 0.5, y: 0.8 } },
    });
    expect(JSON.stringify(serializePreset(preset))).not.toContain("mediaId");
  });

  it("通过 EditorStore 公共命令应用预设，并且不污染预设参数", () => {
    const preset = createPreset("preset-1", "card-overlay", 1, "知识点卡片", {
      text: "新文案",
      position: { x: 0.2, y: 0.3 },
    });
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
