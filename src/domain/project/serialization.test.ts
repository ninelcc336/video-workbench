import { describe, expect, it } from "vitest";
import { deserializeEffectClip, LEGACY_DEFAULT_STARTING_STYLE_ID } from "./serialization";

describe("旧版特效片段兼容读取", () => {
  it("为缺少特效族、起始样式和放置类型的旧 JSON 保留原模板并补齐兼容标记", () => {
    const legacyClip = {
      id: "legacy-transition",
      templateId: "basic-transition",
      templateVersion: 1,
      trackId: "effects-1",
      fromFrame: 45,
      durationInFrames: 15,
      params: { style: "wipe", color: "#111827" },
    };

    expect(deserializeEffectClip(legacyClip)).toEqual({
      ...legacyClip,
      startingStyleId: LEGACY_DEFAULT_STARTING_STYLE_ID,
      placement: { type: "range" },
    });
  });

  it("不把旧基础转场自动改成绑定相邻视频片段的真实片段转场", () => {
    const clip = deserializeEffectClip({
      id: "legacy-transition",
      templateId: "basic-transition",
      templateVersion: 1,
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
