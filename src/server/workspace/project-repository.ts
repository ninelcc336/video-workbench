import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type { EditProject } from "../../domain/project/model";
import { validateProject } from "../../domain/project/validation";
import {
  getWorkspacePaths,
  projectFilePath,
  projectTempFilePath,
  type WorkspacePaths,
} from "./workspace-paths";
import { WorkspaceError as WorkspaceErrorClass } from "./workspace-paths";

export type ProjectSummary = {
  id: string;
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
    const projectId =
      typeof projectOrId === "string"
        ? projectOrId
        : typeof projectOrIdOrId === "string"
          ? projectOrIdOrId
          : "default";

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
    const serialized = `${JSON.stringify(project, null, 2)}\n`;

    try {
      await writeFile(temporary, serialized, "utf8");
      await this.replaceFile(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async loadProject(projectId: string): Promise<EditProject> {
    const filePath = projectFilePath(this.paths, projectId);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceErrorClass("project_not_found", `找不到编辑项目“${projectId}”`);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new WorkspaceErrorClass(
        "corrupt_project",
        `编辑项目“${projectId}”的 JSON 文件已损坏，无法读取`,
      );
    }

    const validation = validateProject(parsed);
    if (!validation.valid) {
      throw new WorkspaceErrorClass(
        "corrupt_project",
        `编辑项目“${projectId}”的数据格式无效：${validation.errors
          .map((error) => error.message)
          .join("；")}`,
        validation,
      );
    }
    return validationProject(parsed);
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
        fileName,
        updatedAt: fileStats.mtime.toISOString(),
        sizeBytes: fileStats.size,
      });
    }
    return summaries.sort((left, right) => left.id.localeCompare(right.id));
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
