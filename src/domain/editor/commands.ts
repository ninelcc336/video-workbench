import { validateProject } from "../project/validation";
import type { EditProject, EffectClip, VideoClip } from "../project/model";

/** 中文注释：编辑器命令只描述用户意图，不携带文件系统或 UI 依赖。 */
export type EditorCommand =
  | { type: "add-video-clip"; clip: VideoClip }
  | { type: "move-video-clip"; clipId: string; fromFrame: number }
  | { type: "delete-video-clip"; clipId: string }
  | { type: "add-effect-clip"; clip: EffectClip }
  | { type: "move-effect-clip"; clipId: string; fromFrame: number }
  | { type: "delete-effect-clip"; clipId: string }
  | {
      type: "update-effect-params";
      clipId: string;
      params: Record<string, unknown>;
    };

function copyVideoClip(clip: VideoClip): VideoClip {
  return { ...clip };
}

function cloneParamValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneParamValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneParamValue(nestedValue)]),
    );
  }
  return value;
}

function copyParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, cloneParamValue(value)]),
  );
}

function copyEffectClip(clip: EffectClip): EffectClip {
  return { ...clip, params: copyParams(clip.params) };
}

function assertCommandResult(project: EditProject): void {
  const result = validateProject(project);
  if (!result.valid) {
    throw new Error(result.errors.map((error) => error.message).join("；"));
  }
}

function assertNonNegativeFrame(fromFrame: number): void {
  if (!Number.isInteger(fromFrame) || fromFrame < 0) {
    throw new RangeError("片段起始帧必须是非负整数");
  }
}

function requireVideoClip(project: EditProject, clipId: string): VideoClip {
  const clip = project.videoClips.find((candidate) => candidate.id === clipId);
  if (!clip) {
    throw new Error(`未找到视频片段：${clipId}`);
  }
  return clip;
}

function requireEffectClip(project: EditProject, clipId: string): EffectClip {
  const clip = project.effectClips.find((candidate) => candidate.id === clipId);
  if (!clip) {
    throw new Error(`未找到特效片段：${clipId}`);
  }
  return clip;
}

/** 中文注释：将单个命令应用为新快照，任何失败都不会修改输入项目。 */
export function applyCommand(
  project: EditProject,
  command: EditorCommand,
): EditProject {
  let nextProject: EditProject;

  switch (command.type) {
    case "add-video-clip":
      nextProject = {
        ...project,
        videoClips: [...project.videoClips.map(copyVideoClip), copyVideoClip(command.clip)],
      };
      break;
    case "move-video-clip": {
      requireVideoClip(project, command.clipId);
      assertNonNegativeFrame(command.fromFrame);
      nextProject = {
        ...project,
        videoClips: project.videoClips.map((clip) =>
          clip.id === command.clipId
            ? { ...copyVideoClip(clip), fromFrame: command.fromFrame }
            : copyVideoClip(clip),
        ),
      };
      break;
    }
    case "delete-video-clip":
      requireVideoClip(project, command.clipId);
      nextProject = {
        ...project,
        videoClips: project.videoClips
          .filter((clip) => clip.id !== command.clipId)
          .map(copyVideoClip),
      };
      break;
    case "add-effect-clip":
      nextProject = {
        ...project,
        effectClips: [
          ...project.effectClips.map(copyEffectClip),
          copyEffectClip(command.clip),
        ],
      };
      break;
    case "move-effect-clip": {
      requireEffectClip(project, command.clipId);
      assertNonNegativeFrame(command.fromFrame);
      nextProject = {
        ...project,
        effectClips: project.effectClips.map((clip) =>
          clip.id === command.clipId
            ? { ...copyEffectClip(clip), fromFrame: command.fromFrame }
            : copyEffectClip(clip),
        ),
      };
      break;
    }
    case "delete-effect-clip":
      requireEffectClip(project, command.clipId);
      nextProject = {
        ...project,
        effectClips: project.effectClips
          .filter((clip) => clip.id !== command.clipId)
          .map(copyEffectClip),
      };
      break;
    case "update-effect-params": {
      requireEffectClip(project, command.clipId);
      nextProject = {
        ...project,
        effectClips: project.effectClips.map((clip) =>
          clip.id === command.clipId
            ? {
                ...copyEffectClip(clip),
                params: copyParams({ ...clip.params, ...command.params }),
              }
            : copyEffectClip(clip),
        ),
      };
      break;
    }
  }

  assertCommandResult(nextProject);
  return nextProject;
}
