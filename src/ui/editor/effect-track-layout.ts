import type { EffectClip } from "../../domain/project/model";

export type EffectTrackLane = {
  id: string;
  clips: EffectClip[];
};

function overlaps(
  leftFromFrame: number,
  leftDurationInFrames: number,
  rightFromFrame: number,
  rightDurationInFrames: number,
): boolean {
  const leftEnd = leftFromFrame + leftDurationInFrames;
  const rightEnd = rightFromFrame + rightDurationInFrames;
  return leftFromFrame < rightEnd && rightFromFrame < leftEnd;
}

/** 中文注释：按起始帧和片段 ID 固定排序，确保相同项目快照每次得到相同轨道布局。 */
export function layoutEffectTracks(
  clips: ReadonlyArray<EffectClip>,
): EffectTrackLane[] {
  const lanes: EffectTrackLane[] = [];
  const usedLaneIds = new Set<string>();
  const sortedClips = [...clips].sort((left, right) =>
    left.fromFrame - right.fromFrame || left.id.localeCompare(right.id),
  );

  for (const clip of sortedClips) {
    const canPlace = (candidate: EffectTrackLane) => candidate.clips.every((placedClip) =>
      !overlaps(
        placedClip.fromFrame,
        placedClip.durationInFrames,
        clip.fromFrame,
        clip.durationInFrames,
      ));
    const lane = lanes.find((candidate) => candidate.id === clip.trackId && canPlace(candidate)) ??
      lanes.find(canPlace);

    if (lane) {
      lane.clips.push(clip);
      continue;
    }

    let laneId = clip.trackId;
    let nextIndex = lanes.length + 1;
    while (!laneId || usedLaneIds.has(laneId)) {
      laneId = `effects-${nextIndex}`;
      nextIndex += 1;
    }
    usedLaneIds.add(laneId);
    lanes.push({ id: laneId, clips: [clip] });
  }

  return lanes;
}

/** 中文注释：新增片段优先占用没有时间重叠的最小轨道号，持久化 trackId 仍由项目快照保存。 */
export function getAvailableEffectTrackId(
  clips: ReadonlyArray<EffectClip>,
  fromFrame: number,
  durationInFrames: number,
): string {
  for (let index = 1; index <= clips.length + 1; index += 1) {
    const trackId = `effects-${index}`;
    const occupied = clips.some((clip) =>
      clip.trackId === trackId && overlaps(
        clip.fromFrame,
        clip.durationInFrames,
        fromFrame,
        durationInFrames,
      ));
    if (!occupied) return trackId;
  }

  return `effects-${clips.length + 1}`;
}
