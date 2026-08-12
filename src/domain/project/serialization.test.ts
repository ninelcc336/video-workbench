import { describe, expect, it } from "vitest";
import { deserializeEffectClip } from "./serialization";

describe("当前特效片段序列化格式", () => {
  it("拒绝缺少特效族、起始样式和放置类型的开发期旧 JSON", () => {
    const legacyClip = {
      id: "legacy-transition",
      templateId: "basic-transition",
      templateVersion: 1,
      trackId: "effects-1",
      fromFrame: 45,
      durationInFrames: 15,
      params: { style: "wipe", color: "#111827" },
    };

    expect(() => deserializeEffectClip(legacyClip)).toThrow("请重建视频工作区");
  });

  it("读取当前范围放置时不猜测为真实片段转场", () => {
    const clip = deserializeEffectClip({
      id: "legacy-transition",
      templateId: "basic-transition",
      templateVersion: 1,
      effectFamilyId: "basic-transition",
      startingStyleId: "default",
      placement: { type: "range" },
      trackId: "effects-1",
      fromFrame: 45,
      durationInFrames: 15,
      params: { style: "fade", color: "#000000" },
    });

    expect(clip.templateId).toBe("basic-transition");
    expect(clip.templateVersion).toBe(1);
    expect(clip.placement).toEqual({ type: "range" });
    expect(clip.placement).not.toHaveProperty("beforeVideoClipId");
    expect(clip.placement).not.toHaveProperty("afterVideoClipId");
  });
});
