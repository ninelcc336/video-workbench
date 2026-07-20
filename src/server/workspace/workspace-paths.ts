import { join, relative, resolve, isAbsolute, extname } from "node:path";
import { mkdir } from "node:fs/promises";

/** 中文注释：工作区目录名集中定义，避免各仓储自行拼接路径导致目录漂移。 */
export const WORKSPACE_DIRECTORY_NAMES = [
  "projects",
  "media",
  "presets",
  "video-templates",
  "renders",
] as const;

export type WorkspacePaths = {
  root: string;
  projects: string;
  media: string;
  presets: string;
  videoTemplates: string;
  renders: string;
};

export type WorkspaceErrorCode =
  | "unsafe_path"
  | "invalid_project"
  | "project_not_found"
  | "project_exists"
  | "corrupt_project"
  | "backup_not_found"
  | "workspace_not_found"
  | "media_not_found"
  | "missing_media"
  | "invalid_media"
  | "media_in_use";

/** 中文注释：所有边界错误都带稳定 code，路由层可据此返回用户能理解的错误。 */
export class WorkspaceError extends Error {
  public readonly code: WorkspaceErrorCode;
  public readonly details?: unknown;

  constructor(code: WorkspaceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.details = details;
  }
}

export function getWorkspacePaths(rootPath: string): WorkspacePaths {
  const root = resolve(rootPath);
  return {
    root,
    projects: join(root, "projects"),
    media: join(root, "media"),
    presets: join(root, "presets"),
    videoTemplates: join(root, "video-templates"),
    renders: join(root, "renders"),
  };
}

/** 中文注释：创建工作区时一次性建立所有首版约定目录，重复调用保持幂等。 */
export async function ensureWorkspaceDirectories(paths: WorkspacePaths): Promise<void> {
  await Promise.all(
    [
      paths.root,
      paths.projects,
      paths.media,
      paths.presets,
      paths.videoTemplates,
      paths.renders,
    ].map((directory) => mkdir(directory, { recursive: true })),
  );
}

/** 中文注释：ID 只能作为单个文件名片段，禁止分隔符、绝对路径和点目录。 */
export function assertSafePathSegment(value: string, label = "路径标识"): string {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("\0") ||
    value.includes("/") ||
    value.includes("\\") ||
    isAbsolute(value)
  ) {
    throw new WorkspaceError("unsafe_path", `${label}包含不安全的路径片段`);
  }
  return value;
}

function assertInside(directory: string, filePath: string): string {
  const relativePath = relative(directory, filePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new WorkspaceError("unsafe_path", "生成的文件路径超出本地工作区");
  }
  return filePath;
}

export function projectFilePath(paths: WorkspacePaths, projectId: string): string {
  const safeId = assertSafePathSegment(projectId, "项目 ID");
  return assertInside(paths.projects, join(paths.projects, `${safeId}.json`));
}

export function projectTempFilePath(paths: WorkspacePaths, projectId: string): string {
  const safeId = assertSafePathSegment(projectId, "项目 ID");
  return assertInside(paths.projects, join(paths.projects, `.${safeId}.json.tmp`));
}

/** 中文注释：备份与正式项目放在同一目录，确保恢复时不会跨工作区读取文件。 */
export function projectBackupFilePath(paths: WorkspacePaths, projectId: string): string {
  const safeId = assertSafePathSegment(projectId, "项目 ID");
  return assertInside(paths.projects, join(paths.projects, `.${safeId}.json.bak`));
}

export function mediaAssetPath(
  paths: WorkspacePaths,
  mediaId: string,
  extension = "",
): string {
  const safeId = assertSafePathSegment(mediaId, "素材 ID");
  if (extension && (!extension.startsWith(".") || extension.includes("/") || extension.includes("\\"))) {
    throw new WorkspaceError("unsafe_path", "素材扩展名包含不安全的路径片段");
  }
  return assertInside(paths.media, join(paths.media, `${safeId}${extension}`));
}

export function mediaMetadataPath(paths: WorkspacePaths, mediaId: string): string {
  const safeId = assertSafePathSegment(mediaId, "素材 ID");
  return assertInside(paths.media, join(paths.media, `${safeId}.asset.json`));
}

export function extensionFromMediaName(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  // 中文注释：只保留扩展名，原始文件名永远不能参与目标路径拼接。
  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : "";
}
