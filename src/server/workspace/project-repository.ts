import {
  copyFile,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type { EditProject } from "../../domain/project/model";
import { deserializeEffectClip } from "../../domain/project/serialization";
import { validateProject } from "../../domain/project/validation";
import {
  getWorkspacePaths,
  assertSafePathSegment,
  projectBackupFilePath,
  projectFilePath,
  projectTempFilePath,
  type WorkspacePaths,
} from "./workspace-paths";
import { WorkspaceError as WorkspaceErrorClass } from "./workspace-paths";

export type ProjectSummary = {
  id: string;
  /** 中文注释：当前版本用 ID 作为默认显示名，重命名时由仓储同步更新。 */
  name: string;
  fileName: string;
  updatedAt: string;
  sizeBytes: number;
};

function isEditProject(value: unknown): value is EditProject {
  return validateProject(value).valid;
}

function projectIdFromFileName(fileName: string): string {
  return fileName.slice(0, -".json".length);
}

/** 中文注释：项目名称既是展示名称也是 Windows 文件名，统一裁剪、阻止保留名和路径危险字符。 */
function normalizeProjectId(projectId: string): string {
  const normalized = projectId.trim();
  assertSafePathSegment(normalized, "项目名称");
  const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
  const baseName = normalized.split(".")[0] ?? normalized;
  if (
    /[<>:"|?*\u0000-\u001f]/u.test(normalized)
    || /[. ]$/u.test(normalized)
    || windowsReservedName.test(baseName)
  ) {
    throw new WorkspaceErrorClass("unsafe_path", "项目名称包含 Windows 不支持的字符或保留名");
  }
  return normalized;
}

/** 中文注释：把旧项目提升到当前数据版本，迁移只作用于内存快照。 */
function migrateProject(value: unknown): { project: EditProject; migrated: boolean } {
  if (!value || typeof value !== "object") {
    throw new WorkspaceErrorClass("corrupt_project", "项目数据不是对象");
  }

  const source = value as Record<string, unknown>;
  const schemaVersion = source.schemaVersion === undefined ? 0 : source.schemaVersion;
  if (schemaVersion !== 0 && schemaVersion !== 1) {
    throw new WorkspaceErrorClass("corrupt_project", `不支持的项目数据版本：${String(schemaVersion)}`);
  }

  const effectClips: EditProject["effectClips"] | unknown = Array.isArray(source.effectClips)
    ? source.effectClips.map(deserializeEffectClip)
    : source.effectClips;

  if (schemaVersion === 1) {
    return {
      project: { ...(value as EditProject), effectClips: effectClips as EditProject["effectClips"] },
      migrated: false,
    };
  }

  // 中文注释：早期项目可能没有 sourceStartFrame/audioEnabled/export，补齐安全默认值后再走统一校验。
  const videoClips: EditProject["videoClips"] | unknown = Array.isArray(source.videoClips)
    ? source.videoClips.map((clip) => ({
        ...(clip as Record<string, unknown>),
        sourceStartFrame: (clip as Record<string, unknown>).sourceStartFrame ?? 0,
        audioEnabled: (clip as Record<string, unknown>).audioEnabled ?? true,
      }))
    : source.videoClips;
  const settings = source.settings as Record<string, unknown> | undefined;
  const exportSettings: EditProject["export"] | undefined = source.export as EditProject["export"] | undefined ?? (settings
    ? { format: "mp4", width: settings.width as number, height: settings.height as number, fps: settings.fps as number }
    : undefined);
  return {
    migrated: true,
    project: {
      ...(source as unknown as EditProject),
      schemaVersion: 1,
      videoClips: videoClips as EditProject["videoClips"],
      effectClips: effectClips as EditProject["effectClips"],
      export: exportSettings as EditProject["export"],
    },
  };
}

/** 中文注释：项目仓储只负责 JSON 持久化，不处理编辑器状态和渲染任务。 */
export class ProjectRepository {
  public readonly paths: WorkspacePaths;

  constructor(pathsOrRoot: WorkspacePaths | string) {
    this.paths = typeof pathsOrRoot === "string" ? getWorkspacePaths(pathsOrRoot) : pathsOrRoot;
  }

  async saveProject(project: EditProject, projectId?: string): Promise<void>;
  async saveProject(projectId: string, project: EditProject): Promise<void>;
  async saveProject(
    projectOrId: EditProject | string,
    projectOrIdOrId?: EditProject | string,
  ): Promise<void> {
    const project = typeof projectOrId === "string" ? projectOrIdOrId : projectOrId;
    const requestedProjectId =
      typeof projectOrId === "string"
        ? projectOrId
        : typeof projectOrIdOrId === "string"
          ? projectOrIdOrId
          : "default";
    const projectId = normalizeProjectId(requestedProjectId);

    if (!isEditProject(project)) {
      const result = validateProject(project);
      throw new WorkspaceErrorClass(
        "invalid_project",
        `项目数据无效：${result.valid ? "未知错误" : result.errors.map((error) => error.message).join("；")}`,
        result,
      );
    }

    const destination = projectFilePath(this.paths, projectId);
    const temporary = projectTempFilePath(this.paths, projectId);
    const backup = projectBackupFilePath(this.paths, projectId);
    const backupTemporary = `${backup}.tmp`;
    const serialized = `${JSON.stringify(project, null, 2)}\n`;

    try {
      // 中文注释：先复制旧正式文件为最近备份，再替换正式文件；新项目没有旧文件时不制造空备份。
      try {
        await copyFile(destination, backupTemporary);
        await this.replaceFile(backupTemporary, backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await rm(backupTemporary, { force: true });
      }
      await writeFile(temporary, serialized, "utf8");
      await this.replaceFile(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      await rm(backupTemporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async loadProject(projectId: string): Promise<EditProject> {
    const resolvedProjectId = await this.resolveExistingProjectId(projectId);
    const filePath = projectFilePath(this.paths, resolvedProjectId);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceErrorClass("project_not_found", `找不到编辑项目“${resolvedProjectId}”`);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new WorkspaceErrorClass(
        "corrupt_project",
          `编辑项目“${resolvedProjectId}”的 JSON 文件已损坏，无法读取`,
      );
    }

    let migrated: { project: EditProject; migrated: boolean };
    try {
      migrated = migrateProject(parsed);
    } catch (error) {
      if (error instanceof WorkspaceErrorClass) throw error;
      throw new WorkspaceErrorClass("corrupt_project", `编辑项目“${resolvedProjectId}”迁移失败`, error);
    }
    const validation = validateProject(migrated.project);
    if (!validation.valid) {
      throw new WorkspaceErrorClass(
        "corrupt_project",
        `编辑项目“${resolvedProjectId}”的数据格式无效：${validation.errors
          .map((error) => error.message)
          .join("；")}`,
        validation,
      );
    }
    const project = validationProject(migrated.project);
    if (migrated.migrated) {
      // 中文注释：迁移成功后再原子保存，失败时原始文件仍由备份和正式文件保护。
      await this.saveProject(project, resolvedProjectId);
    }
    return project;
  }

  /** 中文注释：只从最近备份读取，不覆盖损坏的正式项目，供用户明确点击“从备份恢复”。 */
  async loadProjectFromBackup(projectId: string): Promise<EditProject> {
    const backupPath = projectBackupFilePath(this.paths, projectId);
    let raw: string;
    try {
      raw = await readFile(backupPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceErrorClass("backup_not_found", `项目“${projectId}”没有可用备份`);
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new WorkspaceErrorClass("corrupt_project", `项目“${projectId}”的备份已损坏`);
    }
    const migrated = migrateProject(parsed).project;
    const validation = validateProject(migrated);
    if (!validation.valid) {
      throw new WorkspaceErrorClass("corrupt_project", `项目“${projectId}”的备份数据无效`, validation);
    }
    return migrated;
  }

  /** 中文注释：恢复操作只替换正式文件，不把损坏的正式内容覆盖掉唯一可用备份。 */
  async restoreProjectFromBackup(projectId: string): Promise<EditProject> {
    const project = await this.loadProjectFromBackup(projectId);
    const temporary = projectTempFilePath(this.paths, projectId);
    try {
      await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, "utf8");
      await this.replaceFile(temporary, projectFilePath(this.paths, projectId));
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return project;
  }

  /** 中文注释：判断是否有最近备份，便于损坏项目页面展示恢复入口。 */
  async hasProjectBackup(projectId: string): Promise<boolean> {
    try {
      await stat(projectBackupFilePath(this.paths, projectId));
      return true;
    } catch {
      return false;
    }
  }

  /** 中文注释：创建项目只写一个合法的空项目，避免项目管理路由自行拼接模型。 */
  async createProject(projectId: string, project: EditProject): Promise<void> {
    const normalizedProjectId = normalizeProjectId(projectId);
    const existingProjectId = await this.findExistingProjectId(normalizedProjectId);
    if (existingProjectId) throw new WorkspaceErrorClass("project_exists", `编辑项目“${normalizedProjectId}”已存在`);
    await this.saveProject(project, normalizedProjectId);
  }

  /** 中文注释：重命名只移动项目记录与备份，不触碰共享视频素材。 */
  async renameProject(projectId: string, nextProjectId: string): Promise<void> {
    const sourceProjectId = await this.resolveExistingProjectId(projectId);
    const normalizedNextProjectId = normalizeProjectId(nextProjectId);
    const existingProjectId = await this.findExistingProjectId(normalizedNextProjectId);
    if (existingProjectId && existingProjectId.toLocaleLowerCase("en-US") !== sourceProjectId.toLocaleLowerCase("en-US")) {
      throw new WorkspaceErrorClass("project_exists", `编辑项目“${normalizedNextProjectId}”已存在`);
    }
    const source = projectFilePath(this.paths, sourceProjectId);
    const destination = projectFilePath(this.paths, normalizedNextProjectId);
    if (sourceProjectId === normalizedNextProjectId) return;
    try {
      await rename(source, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceErrorClass("project_not_found", `找不到编辑项目“${sourceProjectId}”`);
      throw error;
    }
    try {
      await rename(projectBackupFilePath(this.paths, sourceProjectId), projectBackupFilePath(this.paths, normalizedNextProjectId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // 中文注释：备份移动失败时回滚正式项目名称，避免项目与备份出现半完成的重命名状态。
        await rename(destination, source).catch(() => undefined);
        throw error;
      }
    }
  }

  /** 中文注释：删除项目记录及其备份，不级联删除任何媒体资产。 */
  async deleteProject(projectId: string): Promise<void> {
    const resolvedProjectId = await this.resolveExistingProjectId(projectId);
    try {
      await rm(projectFilePath(this.paths, resolvedProjectId), { force: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceErrorClass("project_not_found", `找不到编辑项目“${resolvedProjectId}”`);
      throw error;
    }
    await rm(projectBackupFilePath(this.paths, resolvedProjectId), { force: true });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.paths.projects);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const summaries: ProjectSummary[] = [];
    for (const fileName of fileNames.filter((name) => name.endsWith(".json"))) {
      const filePath = projectFilePath(this.paths, projectIdFromFileName(fileName));
      const fileStats = await stat(filePath);
      summaries.push({
        id: projectIdFromFileName(fileName),
        name: projectIdFromFileName(fileName),
        fileName,
        updatedAt: fileStats.mtime.toISOString(),
        sizeBytes: fileStats.size,
      });
    }
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  /** 中文注释：Windows 对文件名大小写不敏感，读取与删除也必须解析到已存在的规范项目名称。 */
  private async resolveExistingProjectId(projectId: string): Promise<string> {
    return await this.findExistingProjectId(projectId) ?? normalizeProjectId(projectId);
  }

  /** 中文注释：通过项目目录扫描统一处理大小写不敏感的名称冲突，避免依赖运行系统差异。 */
  private async findExistingProjectId(projectId: string): Promise<string | null> {
    const normalizedProjectId = normalizeProjectId(projectId);
    let fileNames: string[];
    try {
      fileNames = await readdir(this.paths.projects);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return fileNames
      .filter((fileName) => fileName.endsWith(".json"))
      .map(projectIdFromFileName)
      .find((existingProjectId) => existingProjectId.localeCompare(normalizedProjectId, "en-US", { sensitivity: "accent" }) === 0)
      ?? null;
  }

  private async replaceFile(temporary: string, destination: string): Promise<void> {
    try {
      await rename(temporary, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // 中文注释：Windows 不能总是直接覆盖已有文件，保留同目录临时文件后再替换。
      if (code !== "EEXIST" && code !== "EPERM" && code !== "ENOTEMPTY") {
        throw error;
      }
      await rm(destination, { force: true });
      await rename(temporary, destination);
    }
  }
}

function validationProject(value: unknown): EditProject {
  return value as EditProject;
}
