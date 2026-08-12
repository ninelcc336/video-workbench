import { validateProject } from "../project/validation";
import { createEmptyProject } from "../project/factories";
import type { EditProject, EffectClip, VideoClip } from "../project/model";
import {
  reconcileBoundaryTransitionPlacements,
  resolveBoundaryTransition,
} from "../project/transition";
import {
  createEffectFamilyInstance,
  getAspectRatioForCanvas,
  getEffectFamily,
  switchStartingStyle,
} from "../templates/effect-family";

/** 中文注释：视频尺寸只用于导入瞬间判断素材方向，不写入编辑项目持久化快照。 */
export type VideoDimensions = {
  width: number;
  height: number;
  /** 中文注释：首个视频的源帧率用于建立项目时基，无法读取时由页面传入 30。 */
  fps?: number;
};

/** 中文注释：样式切换是一条独立领域命令，保证用户可以用一次撤销回到操作前的完整片段。 */
export type EffectFamilyEditorCommand = {
  type: "switch-effect-style";
  clipId: string;
  startingStyleId: string;
  useAspectRatioLayout?: boolean;
};

export type EditorCommand =
  | { type: "reset-project" }
  | { type: "add-video-clip"; clip: VideoClip; sourceDimensions?: VideoDimensions }
  | { type: "move-video-clip"; clipId: string; fromFrame: number }
  | { type: "resize-video-clip"; clipId: string; fromFrame: number; durationInFrames: number }
  | { type: "delete-video-clip"; clipId: string }
  | { type: "add-effect-clip"; clip: EffectClip }
  | { type: "add-effect-clips"; clips: EffectClip[] }
  | { type: "move-effect-clip"; clipId: string; fromFrame: number }
  | { type: "resize-effect-clip"; clipId: string; fromFrame: number; durationInFrames: number }
  | { type: "delete-effect-clip"; clipId: string }
  | {
      type: "update-effect-params";
      clipId: string;
      params: Record<string, unknown>;
    }
  | EffectFamilyEditorCommand;

export type CommandResult = {
  project: EditProject;
  notices: string[];
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

/** 中文注释：裁剪命令在领域边界统一校验起点和时长，保证一次操作可以安全进入历史。 */
function assertClipRange(fromFrame: number, durationInFrames: number): void {
  assertNonNegativeFrame(fromFrame);
  if (!Number.isInteger(durationInFrames) || durationInFrames < 1) {
    throw new RangeError("片段时长必须是正整数");
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

/** 中文注释：边界特效只能绑定当前严格相邻的视频片段，创建时立即拒绝非法位置，绝不退化成范围放置。 */
function normalizeBoundaryEffectClip(project: EditProject, clip: EffectClip): EffectClip {
  if (clip.placement?.type !== "boundary") return copyEffectClip(clip);
  const resolved = resolveBoundaryTransition(project, clip);
  if (!resolved) {
    throw new Error("片段转场只能绑定当前相邻的视频片段交界点");
  }
  return { ...copyEffectClip(clip), fromFrame: resolved.fromFrame };
}

/** 中文注释：视频时间轴操作后刷新所有边界转场，把派生位置和失效提示作为同一条命令结果返回。 */
function reconcileVideoBoundaryTransitions(project: EditProject): CommandResult {
  const reconciled = reconcileBoundaryTransitionPlacements(project);
  return {
    project: reconciled.project,
    notices: reconciled.notices,
  };
}

/** 中文注释：根据当前片段保存的族版本构造样式切换实例；不兼容的族或样式直接让命令失败。 */
function resolveEffectFamilyInstance(
  project: EditProject,
  clip: EffectClip,
): { family: ReturnType<typeof getEffectFamily>; instance: ReturnType<typeof createEffectFamilyInstance> } {
  const family = getEffectFamily(clip.effectFamilyId, clip.templateVersion);
  const aspectRatio = getAspectRatioForCanvas(project.settings.width, project.settings.height);
  const startingStyleId = family.startingStyles.some((style) => style.id === clip.startingStyleId)
    ? clip.startingStyleId
    : undefined;
  if (!startingStyleId) throw new Error(`特效片段“${clip.id}”的起始样式与当前特效族不兼容，请重新添加特效`);

  return {
    family,
    instance: {
      ...createEffectFamilyInstance(family, startingStyleId, aspectRatio),
      durationInFrames: clip.durationInFrames,
      params: copyParams(clip.params),
    },
  };
}

/** 中文注释：主视频轨道为空时按真实元数据匹配画布；兼容旧调用只传尺寸的横屏行为。 */
function shouldMatchSourceCanvas(project: EditProject, dimensions: VideoDimensions | undefined): boolean {
  return Boolean(
      dimensions
      && Number.isFinite(dimensions.width)
      && Number.isFinite(dimensions.height)
      && project.videoClips.length === 0
      && (dimensions.fps !== undefined || dimensions.width > dimensions.height),
  );
}

/** 中文注释：首个素材决定画布比例和帧率，尺寸统一缩放到适合编辑的长边。 */
function matchSourceCanvas(project: EditProject, dimensions: VideoDimensions): EditProject {
  const ratio = dimensions.width / dimensions.height;
  const settings = ratio > 1
    ? { ...project.settings, width: 1920, height: Math.max(1, Math.round(1920 / ratio)) }
    : ratio < 1
      ? { ...project.settings, width: Math.max(1, Math.round(1920 * ratio)), height: 1920 }
      : { ...project.settings, width: 1080, height: 1080 };
  if (dimensions.fps && Number.isFinite(dimensions.fps) && dimensions.fps > 0) {
    settings.fps = Math.max(1, Math.round(dimensions.fps));
  }
  return {
    ...project,
    settings,
    export: { ...project.export, width: settings.width, height: settings.height, fps: settings.fps },
  };
}

/** 中文注释：将单个命令应用为新快照，任何失败都不会修改输入项目。 */
export function applyCommandWithResult(
  project: EditProject,
  command: EditorCommand,
): CommandResult {
  let nextProject: EditProject;
  let notices: string[] = [];

  switch (command.type) {
    case "reset-project":
      // 中文注释：重置只清空编辑项目快照，不删除本地工作区中已导入的媒体文件。
      nextProject = createEmptyProject();
      break;
    case "add-video-clip":
      // 中文注释：横屏匹配与新增首个视频片段属于同一用户操作，历史记录可整体撤销。
      const sourceDimensions = command.sourceDimensions;
      const projectForVideo = sourceDimensions && shouldMatchSourceCanvas(project, sourceDimensions)
        ? matchSourceCanvas(project, sourceDimensions)
        : project;
      nextProject = {
        ...projectForVideo,
        videoClips: [...projectForVideo.videoClips.map(copyVideoClip), copyVideoClip(command.clip)],
      };
      ({ project: nextProject, notices } = reconcileVideoBoundaryTransitions(nextProject));
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
      ({ project: nextProject, notices } = reconcileVideoBoundaryTransitions(nextProject));
      break;
    }
    case "resize-video-clip": {
      requireVideoClip(project, command.clipId);
      assertClipRange(command.fromFrame, command.durationInFrames);
      nextProject = {
        ...project,
        videoClips: project.videoClips.map((clip) =>
          clip.id === command.clipId
            ? { ...copyVideoClip(clip), fromFrame: command.fromFrame, durationInFrames: command.durationInFrames }
            : copyVideoClip(clip),
        ),
      };
      ({ project: nextProject, notices } = reconcileVideoBoundaryTransitions(nextProject));
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
      ({ project: nextProject, notices } = reconcileVideoBoundaryTransitions(nextProject));
      break;
    case "add-effect-clip":
      nextProject = {
        ...project,
        effectClips: [
          ...project.effectClips.map(copyEffectClip),
          normalizeBoundaryEffectClip(project, command.clip),
        ],
      };
      break;
    case "add-effect-clips":
      // 中文注释：视频模板套用以批量命令进入一次历史，用户可以用一次撤销撤回整套布局。
      nextProject = {
        ...project,
        effectClips: [
          ...project.effectClips.map(copyEffectClip),
          ...command.clips.map((clip) => normalizeBoundaryEffectClip(project, clip)),
        ],
      };
      break;
    case "move-effect-clip": {
      const clip = requireEffectClip(project, command.clipId);
      if (clip.placement?.type === "boundary") {
        throw new Error("片段转场的位置由相邻视频片段交界点决定");
      }
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
    case "resize-effect-clip": {
      const clip = requireEffectClip(project, command.clipId);
      assertClipRange(command.fromFrame, command.durationInFrames);
      nextProject = {
        ...project,
        effectClips: project.effectClips.map((clip) =>
          clip.id === command.clipId
            ? {
                ...copyEffectClip(clip),
                fromFrame: clip.placement?.type === "boundary"
                  ? (resolveBoundaryTransition(project, clip)?.fromFrame ?? command.fromFrame)
                  : command.fromFrame,
                durationInFrames: command.durationInFrames,
              }
            : copyEffectClip(clip),
        ),
      };
      if (clip.placement?.type === "boundary") {
        ({ project: nextProject, notices } = reconcileVideoBoundaryTransitions(nextProject));
      }
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
    case "switch-effect-style": {
      const clip = requireEffectClip(project, command.clipId);
      const { family, instance } = resolveEffectFamilyInstance(project, clip);
      const result = switchStartingStyle(family, instance, command.startingStyleId, {
        useAspectRatioLayout: command.useAspectRatioLayout,
      });
      if (result.errors.length > 0) {
        throw new Error(result.errors.map((error) => error.message).join("；"));
      }
      nextProject = {
        ...project,
        effectClips: project.effectClips.map((candidate) => candidate.id === clip.id
          ? {
              ...copyEffectClip(candidate),
              effectFamilyId: family.id,
              startingStyleId: result.instance.startingStyleId,
              params: copyParams(result.instance.params),
            }
          : copyEffectClip(candidate)),
      };
      break;
    }
  }

  assertCommandResult(nextProject);
  return { project: nextProject, notices };
}

/** 中文注释：保留旧的纯项目返回接口，供不需要用户提示的领域调用方继续使用。 */
export function applyCommand(project: EditProject, command: EditorCommand): EditProject {
  return applyCommandWithResult(project, command).project;
}
