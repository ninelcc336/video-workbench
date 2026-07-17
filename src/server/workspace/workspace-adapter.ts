import type { EditProject } from "../../domain/project/model";
import { pathToFileURL } from "node:url";
import { MediaRepository, type MediaAsset, type MediaImportFile } from "./media-repository";
import { ProjectRepository, type ProjectSummary } from "./project-repository";
import {
  ensureWorkspaceDirectories,
  getWorkspacePaths,
  WorkspaceError,
  type WorkspacePaths,
} from "./workspace-paths";

export { WorkspaceError } from "./workspace-paths";
export type { MediaAsset, MediaImportFile } from "./media-repository";
export type { ProjectSummary } from "./project-repository";

export type ProjectLoadResult = {
  project: EditProject;
  missingMediaIds: string[];
};

/** 中文注释：适配器把编辑器看到的工作区能力收拢起来，未来可替换为云端实现。 */
export class WorkspaceAdapter {
  private rootPath: string;
  private paths: WorkspacePaths;
  private projectRepository: ProjectRepository;
  private mediaRepository: MediaRepository;

  constructor(rootPathOrPaths: string | WorkspacePaths) {
    this.rootPath = typeof rootPathOrPaths === "string" ? rootPathOrPaths : rootPathOrPaths.root;
    this.paths = typeof rootPathOrPaths === "string" ? getWorkspacePaths(rootPathOrPaths) : rootPathOrPaths;
    this.projectRepository = new ProjectRepository(this.paths);
    this.mediaRepository = new MediaRepository(this.paths);
  }

  async createWorkspace(rootPath = this.rootPath): Promise<void> {
    this.rootPath = rootPath;
    this.paths = getWorkspacePaths(rootPath);
    await ensureWorkspaceDirectories(this.paths);
    this.projectRepository = new ProjectRepository(this.paths);
    this.mediaRepository = new MediaRepository(this.paths);
  }

  async saveProject(project: EditProject, projectId?: string): Promise<void>;
  async saveProject(projectId: string, project: EditProject): Promise<void>;
  async saveProject(
    projectOrId: EditProject | string,
    projectOrIdValue?: EditProject | string,
  ): Promise<void> {
    if (typeof projectOrId === "string") {
      await this.projectRepository.saveProject(projectOrId, projectOrIdValue as EditProject);
      return;
    }
    await this.projectRepository.saveProject(projectOrId, projectOrIdValue as string | undefined);
  }

  async loadProject(projectId: string): Promise<EditProject> {
    return this.projectRepository.loadProject(projectId);
  }

  /** 中文注释：缺失素材是可恢复的项目状态，打开时保留项目而不是回退成空项目。 */
  async loadProjectWithMediaStatus(projectId: string): Promise<ProjectLoadResult> {
    const project = await this.projectRepository.loadProject(projectId);
    const missingMediaIds = await this.mediaRepository.findMissingMediaIds(
      project.videoClips.map((clip) => clip.mediaId),
    );
    return { project, missingMediaIds };
  }

  async importMedia(file: MediaImportFile): Promise<MediaAsset> {
    return this.mediaRepository.importMedia(file);
  }

  /** 中文注释：稳定媒体地址只由服务端根据素材 ID 解析，前端不需要知道工作区绝对路径。 */
  async getMediaPath(mediaId: string): Promise<string | null> {
    return this.mediaRepository.getMediaPath(mediaId);
  }

  /** 中文注释：渲染适配器使用真实本地路径，浏览器预览则使用工作区 HTTP 地址。 */
  async getMediaSources(mediaIds: string[]): Promise<Record<string, string>> {
    const sources: Record<string, string> = {};
    for (const mediaId of [...new Set(mediaIds)]) {
      const path = await this.getMediaPath(mediaId);
      // 中文注释：Remotion 在 Chromium 子进程中读取素材，使用 file URL 可避免 Windows 反斜杠被当成转义字符。
      if (path) sources[mediaId] = pathToFileURL(path).href;
    }
    return sources;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.projectRepository.listProjects();
  }

  getPaths(): WorkspacePaths {
    return this.paths;
  }
}

export function createWorkspaceAdapter(rootPath: string): WorkspaceAdapter {
  return new WorkspaceAdapter(rootPath);
}

/** 中文注释：提供计划中约定的独立工作区初始化入口，实际能力仍由同一个适配器承载。 */
export async function createWorkspace(rootPath: string): Promise<void> {
  await createWorkspaceAdapter(rootPath).createWorkspace();
}
