import { validateProject } from "../project/validation";
import type { EditProject, EffectClip, VideoClip } from "../project/model";

/** 中文注释：视频尺寸只用于导入瞬间判断素材方向，不写入编辑项目持久化快照。 */
export type VideoDimensions = {
  width: number;
  height: number;
};

/** 中文注释：编辑器命令只描述用户意图，不携带文件系统或 UI 依赖。 */
export type EditorCommand =
  | { type: "add-video-clip"; clip: VideoClip; sourceDimensions?: VideoDimensions }
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

/** 中文注释：主视频轨道为空时可按首个横屏素材匹配画布；已有特效使用相对参数，不阻止这次匹配。 */
function shouldMatchLandscapeCanvas(project: EditProject, dimensions: VideoDimensions | undefined): boolean {
  return Boolean(
    dimensions
      && Number.isFinite(dimensions.width)
      && Number.isFinite(dimensions.height)
      && dimensions.width > dimensions.height
      && project.videoClips.length === 0,
  );
}

/** 中文注释：横屏画布统一以 1920 为长边，并从首个素材推导高度以保留其原始比例。 */
function matchLandscapeCanvas(project: EditProject, dimensions: VideoDimensions): EditProject {
  const width = 1920;
  const height = Math.max(1, Math.round(width * dimensions.height / dimensions.width));
  const settings = { ...project.settings, width, height };
  return {
    ...project,
    settings,
    export: { ...project.export, width: settings.width, height: settings.height, fps: settings.fps },
  };
}

/** 中文注释：将单个命令应用为新快照，任何失败都不会修改输入项目。 */
export function applyCommand(
  project: EditProject,
  command: EditorCommand,
): EditProject {
  let nextProject: EditProject;

  switch (command.type) {
    case "add-video-clip":
      // 中文注释：横屏匹配与新增首个视频片段属于同一用户操作，历史记录可整体撤销。
      const sourceDimensions = command.sourceDimensions;
      const projectForVideo = sourceDimensions && shouldMatchLandscapeCanvas(project, sourceDimensions)
        ? matchLandscapeCanvas(project, sourceDimensions)
        : project;
      nextProject = {
        ...projectForVideo,
        videoClips: [...projectForVideo.videoClips.map(copyVideoClip), copyVideoClip(command.clip)],
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
