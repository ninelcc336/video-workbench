import type { EditProject } from "../project/model";

export type ClipRange = {
  fromFrame: number;
  durationInFrames: number;
};

export type VideoRangeMode = "move" | "resize-left" | "resize-right";

/** 中文注释：统一保证片段起点非负且时长至少为一帧，避免 UI 临时状态和领域命令出现分歧。 */
export function clampClipRange(
  fromFrame: number,
  durationInFrames: number,
): ClipRange {
  return {
    fromFrame: Math.max(0, Math.round(fromFrame)),
    durationInFrames: Math.max(1, Math.round(durationInFrames)),
  };
}

function overlaps(left: ClipRange, right: ClipRange): boolean {
  return left.fromFrame < right.fromFrame + right.durationInFrames
    && right.fromFrame < left.fromFrame + left.durationInFrames;
}

function isLegalVideoStart(
  project: EditProject,
  clipId: string | null,
  fromFrame: number,
  durationInFrames: number,
): boolean {
  const candidate = { fromFrame, durationInFrames };
  return project.videoClips
    .filter((clip) => clip.id !== clipId)
    .every((clip) => !overlaps(candidate, clip));
}

/** 中文注释：在主视频轨道冲突时，从相邻片段边界中寻找距离鼠标最近的合法起点。 */
export function findNearestLegalVideoStart(
  project: EditProject,
  clipId: string | null,
  desiredFromFrame: number,
  durationInFrames: number,
): number {
  const range = clampClipRange(desiredFromFrame, durationInFrames);
  const candidates = new Set<number>([range.fromFrame, 0]);

  for (const clip of project.videoClips) {
    if (clip.id === clipId) continue;
    candidates.add(Math.max(0, clip.fromFrame - range.durationInFrames));
    candidates.add(Math.max(0, clip.fromFrame + clip.durationInFrames));
  }

  const legalCandidates = [...candidates]
    .filter((candidate) => isLegalVideoStart(project, clipId, candidate, range.durationInFrames))
    .sort((left, right) => Math.abs(left - range.fromFrame) - Math.abs(right - range.fromFrame) || left - right);

  return legalCandidates[0] ?? range.fromFrame;
}

function getPreviousVideoEnd(project: EditProject, clipId: string, fromFrame: number): number {
  return Math.max(
    0,
    ...project.videoClips
      .filter((clip) => clip.id !== clipId && clip.fromFrame < fromFrame)
      .map((clip) => clip.fromFrame + clip.durationInFrames),
  );
}

function getNextVideoStart(project: EditProject, clipId: string, endFrame: number): number | null {
  const nextStart = project.videoClips
    .filter((clip) => clip.id !== clipId && clip.fromFrame >= endFrame)
    .map((clip) => clip.fromFrame)
    .sort((left, right) => left - right)[0];
  return nextStart ?? null;
}

/** 中文注释：按移动、左裁剪、右裁剪分别限制视频范围，确保预览期间也不会显示非法重叠。 */
export function normalizeVideoRange(
  project: EditProject,
  clipId: string,
  desiredFromFrame: number,
  desiredDurationInFrames: number,
  mode: VideoRangeMode,
): ClipRange {
  const currentClip = project.videoClips.find((clip) => clip.id === clipId);
  if (!currentClip || mode === "move") {
    const range = clampClipRange(desiredFromFrame, desiredDurationInFrames);
    return {
      ...range,
      fromFrame: findNearestLegalVideoStart(project, clipId, range.fromFrame, range.durationInFrames),
    };
  }

  if (mode === "resize-right") {
    const fromFrame = Math.max(0, Math.round(desiredFromFrame));
    const nextStart = getNextVideoStart(project, clipId, fromFrame + 1);
    const maxDuration = nextStart === null ? Number.POSITIVE_INFINITY : Math.max(1, nextStart - fromFrame);
    return {
      fromFrame,
      durationInFrames: Math.max(1, Math.min(Math.round(desiredDurationInFrames), maxDuration)),
    };
  }

  const endFrame = currentClip.fromFrame + currentClip.durationInFrames;
  const fromFrame = Math.min(
    Math.max(getPreviousVideoEnd(project, clipId, endFrame), Math.round(desiredFromFrame)),
    endFrame - 1,
  );
  return { fromFrame, durationInFrames: Math.max(1, endFrame - fromFrame) };
}
