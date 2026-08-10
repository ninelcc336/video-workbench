import { z } from "zod";
import type { EditProject } from "./model";

export type ValidationError = {
  path: string;
  message: string;
  code: string;
};

export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: ValidationError[] };

const projectSchema = z.object({
  schemaVersion: z.literal(1),
  settings: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
  }),
  videoClips: z.array(
    z.object({
      id: z.string().min(1),
      mediaId: z.string().min(1),
      fromFrame: z.number().int().nonnegative(),
      sourceStartFrame: z.number().int().nonnegative(),
      durationInFrames: z.number().int().positive(),
      audioEnabled: z.boolean(),
    }),
  ),
  effectClips: z.array(
    z.object({
      id: z.string().min(1),
      templateId: z.string().min(1),
      templateVersion: z.number().int().positive(),
      effectFamilyId: z.string().min(1).optional(),
      startingStyleId: z.string().min(1).optional(),
      placement: z.union([
        z.object({ type: z.literal("range") }),
        z.object({
          type: z.literal("boundary"),
          beforeVideoClipId: z.string().min(1),
          afterVideoClipId: z.string().min(1),
        }),
      ]).optional(),
      trackId: z.string().min(1),
      fromFrame: z.number().int().nonnegative(),
      durationInFrames: z.number().int().positive(),
      params: z.record(z.string(), z.unknown()),
    }),
  ),
  export: z.object({
    format: z.literal("mp4"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
  }),
});

function pathToString(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function mapSchemaError(path: PropertyKey[], message: string): ValidationError {
  const pathString = pathToString(path);
  let code = "invalid_project";

  if (pathString.endsWith("templateId")) {
    code = "missing_template_id";
  } else if (pathString.endsWith("fromFrame") || pathString.endsWith("sourceStartFrame")) {
    code = "invalid_frame";
  } else if (pathString.endsWith("durationInFrames")) {
    code = "invalid_duration";
  } else if (pathString === "export.format") {
    code = "unsupported_format";
  }

  return { path: pathString, message, code };
}

function addDuplicateIdErrors(project: EditProject, errors: ValidationError[]): void {
  const seen = new Set<string>();
  const clips = [
    ...project.videoClips.map((clip, index) => ({
      id: clip.id,
      path: `videoClips.${index}.id`,
    })),
    ...project.effectClips.map((clip, index) => ({
      id: clip.id,
      path: `effectClips.${index}.id`,
    })),
  ];

  for (const clip of clips) {
    if (seen.has(clip.id)) {
      errors.push({
        path: clip.path,
        code: "duplicate_id",
        message: `片段 ID“${clip.id}”重复`,
      });
    }
    seen.add(clip.id);
  }
}

function addVideoOverlapErrors(project: EditProject, errors: ValidationError[]): void {
  const sortedClips = project.videoClips
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.fromFrame - right.clip.fromFrame);

  for (let index = 1; index < sortedClips.length; index += 1) {
    const previous = sortedClips[index - 1];
    const current = sortedClips[index];
    const previousEnd = previous.clip.fromFrame + previous.clip.durationInFrames;

    // 中文注释：主视频轨道允许相邻片段，但同一时间帧不能有两个视频片段。
    if (current.clip.fromFrame < previousEnd) {
      errors.push({
        path: `videoClips.${current.index}.fromFrame`,
        code: "overlap",
        message: "主视频轨道上的视频片段不能重叠",
      });
    }
  }
}

/**
 * 中文注释：校验在领域边界完成并返回字段级结果，调用方可以展示错误，
 * 不让领域核心直接抛出 UI 异常。
 */
export function validateProject(project: unknown): ValidationResult {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) =>
      mapSchemaError(issue.path, issue.message),
    );
    return { valid: false, errors };
  }

  const validProject = parsed.data as EditProject;
  const errors: ValidationError[] = [];
  addDuplicateIdErrors(validProject, errors);
  addVideoOverlapErrors(validProject, errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}
