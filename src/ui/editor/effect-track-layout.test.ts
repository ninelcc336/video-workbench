import { describe, expect, it } from "vitest";
import type { EffectClip } from "../../domain/project/model";
import { getAvailableEffectTrackId, layoutEffectTracks } from "./effect-track-layout";

function clip(id: string, fromFrame: number, durationInFrames: number): EffectClip {
  return {
    id,
    templateId: "emphasis-card",
    templateVersion: 1,
    effectFamilyId: "emphasis-card",
    startingStyleId: "solid-card",
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame,
    durationInFrames,
    params: {},
  };
}

describe("特效轨道自动布局", () => {
  it("把重叠片段分配到不同轨道，并保持时间范围不变", () => {
    const clips = [clip("effect-b", 20, 30), clip("effect-a", 0, 40)];

    const tracks = layoutEffectTracks(clips);

    expect(tracks.map((track) => track.id)).toEqual(["effects-1", "effects-2"]);
    expect(tracks[0].clips.map((item) => item.id)).toEqual(["effect-a"]);
    expect(tracks[1].clips.map((item) => item.id)).toEqual(["effect-b"]);
    expect(tracks.flatMap((track) => track.clips)).toEqual(expect.arrayContaining(clips));
    expect(clips.every((item) => item.trackId === "effects-1")).toBe(true);
  });

  it("让不重叠片段复用紧凑轨道", () => {
    const tracks = layoutEffectTracks([clip("effect-a", 0, 20), clip("effect-b", 20, 10)]);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].clips.map((item) => item.id)).toEqual(["effect-a", "effect-b"]);
  });

  it("新增片段优先选择不冲突的持久化轨道编号", () => {
    const existing = [clip("effect-a", 0, 40)];

    expect(getAvailableEffectTrackId(existing, 20, 10)).toBe("effects-2");
    expect(getAvailableEffectTrackId(existing, 40, 10)).toBe("effects-1");
  });
});
