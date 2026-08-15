// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createEffectFamilyInstance, getEffectFamily } from "../../domain/templates/effect-family";
import "../../domain/templates/registry";
import {
  createEffectClipFromTemplate,
  getDropFrame,
  readTemplateDragData,
  writeTemplateDragData,
} from "./drag-and-drop";

describe("模板拖放辅助函数", () => {
  it("把放置位置吸附为非负整数帧，并使用模板默认值", () => {
    const family = getEffectFamily("emphasis-card", 1);
    const clip = createEffectClipFromTemplate(family, "solid-card", -2.4);

    expect(clip.fromFrame).toBe(0);
    expect(clip.durationInFrames).toBe(family.defaultDurationInFrames);
    expect(clip.params).toEqual(createEffectFamilyInstance(family, "solid-card", "16:9").params);
    expect(clip.templateId).toBe(family.id);
    expect(clip.effectFamilyId).toBe(family.id);
    expect(clip.startingStyleId).toBe("solid-card");
    expect(clip.placement).toEqual({ type: "range" });
    expect(clip.templateVersion).toBe(family.version);
    expect(clip.trackId).toBe("effects-1");
  });

  it("将拖放数据往返为模板身份", () => {
    const family = getEffectFamily("geometric-particles", 1);
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    writeTemplateDragData(dataTransfer, family, "floating-bubbles");

    expect(readTemplateDragData(dataTransfer)).toEqual({
      effectFamilyId: family.id,
      effectFamilyVersion: family.version,
      startingStyleId: "floating-bubbles",
    });
  });

  it("拖放族卡片时保留用户选择的起始样式", () => {
    const family = getEffectFamily("emphasis-card", 1);
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    writeTemplateDragData(dataTransfer, family, "solid-card");

    expect(readTemplateDragData(dataTransfer)).toEqual({
      effectFamilyId: family.id,
      effectFamilyVersion: family.version,
      startingStyleId: "solid-card",
    });
  });

  it("按时间轴元素左边界把鼠标位置换算为非负整数帧", () => {
    const timeline = document.createElement("div");
    timeline.getBoundingClientRect = () => ({
      bottom: 100,
      height: 40,
      left: 100,
      right: 700,
      top: 60,
      width: 600,
      x: 100,
      y: 60,
      toJSON: () => ({}),
    });

    expect(getDropFrame({ clientX: 157 } as DragEvent, timeline, 6)).toBe(10);
    expect(getDropFrame({ clientX: 40 } as DragEvent, timeline, 6)).toBe(0);
  });
});
// 中文注释：验证模板拖放数据和帧位置换算。
