import type { EditProject } from "../../domain/project/model";
import { pathToFileURL } from "node:url";
import { PresetRepository } from "../assets/preset-repository";
import { VideoTemplateRepository } from "../assets/video-template-repository";
import type { Preset } from "../../domain/assets/preset-model";
import type { VideoTemplate } from "../../domain/assets/video-template-model";
import { MediaRepository, type MediaAsset, type MediaImportFile } from "./media-repository";
import { ProjectRepository, type ProjectSummary } from "./project-repository";
import {
  ensureWorkspaceDirectories,
  getWorkspacePaths,
  WorkspaceError,
  type WorkspacePaths,
} from "./workspace-paths";
import { WorkspaceRegistry, type RecentWorkspace } from "./workspace-registry";

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
  private presetRepository: PresetRepository;
  private videoTemplateRepository: VideoTemplateRepository;
  private readonly workspaceRegistry: WorkspaceRegistry;

  constructor(rootPathOrPaths: string | WorkspacePaths) {
    this.workspaceRegistry = new WorkspaceRegistry();
    this.rootPath = typeof rootPathOrPaths === "string" ? rootPathOrPaths : rootPathOrPaths.root;
    this.paths = typeof rootPathOrPaths === "string" ? getWorkspacePaths(rootPathOrPaths) : rootPathOrPaths;
    this.projectRepository = new ProjectRepository(this.paths);
    this.mediaRepository = new MediaRepository(this.paths);
    this.presetRepository = new PresetRepository(this.paths);
    this.videoTemplateRepository = new VideoTemplateRepository(this.paths);
  }

  async createWorkspace(rootPath = this.rootPath): Promise<void> {
    this.rootPath = rootPath;
    this.paths = getWorkspacePaths(rootPath);
    await ensureWorkspaceDirectories(this.paths);
    this.projectRepository = new ProjectRepository(this.paths);
    this.mediaRepository = new MediaRepository(this.paths);
    this.presetRepository = new PresetRepository(this.paths);
    this.videoTemplateRepository = new VideoTemplateRepository(this.paths);
    // 中文注释：最近工作区索引是辅助体验，Windows 文件被其他窗口占用时不能阻塞当前工作区打开。
    await this.workspaceRegistry.remember(this.rootPath).catch(() => undefined);
  }

  /** 中文注释：返回最近成功打开的工作区，供启动页选择并再次打开。 */
  async listRecentWorkspaces(): Promise<RecentWorkspace[]> { return this.workspaceRegistry.list(); }

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

  /** 中文注释：损坏项目仍以错误返回，只有用户明确选择恢复时才读取最近备份。 */
  async loadProjectFromBackup(projectId: string): Promise<EditProject> {
    return this.projectRepository.loadProjectFromBackup(projectId);
  }

  async restoreProjectFromBackup(projectId: string): Promise<EditProject> {
    return this.projectRepository.restoreProjectFromBackup(projectId);
  }

  async hasProjectBackup(projectId: string): Promise<boolean> {
    return this.projectRepository.hasProjectBackup(projectId);
  }

  /** 中文注释：项目生命周期方法统一走同一个仓储，删除项目不会触碰共享素材。 */
  async createProject(projectId: string, project: EditProject): Promise<void> {
    return this.projectRepository.createProject(projectId, project);
  }

  async renameProject(projectId: string, nextProjectId: string): Promise<void> {
    return this.projectRepository.renameProject(projectId, nextProjectId);
  }

  async copyProject(projectId: string, nextProjectId: string): Promise<void> {
    return this.projectRepository.copyProject(projectId, nextProjectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.projectRepository.deleteProject(projectId);
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

  async listMedia(): Promise<MediaAsset[]> {
    return this.mediaRepository.listMedia();
  }

  async getMediaAsset(mediaId: string): Promise<MediaAsset | null> {
    return this.mediaRepository.getMediaAsset(mediaId);
  }

  async renameMedia(mediaId: string, originalName: string): Promise<MediaAsset> {
    return this.mediaRepository.renameMedia(mediaId, originalName);
  }

  async relinkMedia(mediaId: string, file: MediaImportFile): Promise<MediaAsset> {
    return this.mediaRepository.relinkMedia(mediaId, file);
  }

  async undoRelinkMedia(mediaId: string): Promise<MediaAsset> {
    return this.mediaRepository.undoRelinkMedia(mediaId);
  }

  /** 中文注释：删除前扫描所有项目引用，防止一个项目清理素材后破坏其他项目。 */
  async deleteMedia(mediaId: string): Promise<void> {
    const references = await this.findMediaReferences(mediaId);
    if (references.length > 0) {
      throw new WorkspaceError("media_in_use", `素材仍被项目引用：${references.join("、")}`, { references });
    }
    await this.mediaRepository.deleteMedia(mediaId);
  }

  async findMediaReferences(mediaId: string): Promise<string[]> {
    const references: string[] = [];
    for (const summary of await this.projectRepository.listProjects()) {
      try {
        const project = await this.projectRepository.loadProject(summary.id);
        if (project.videoClips.some((clip) => clip.mediaId === mediaId)) references.push(summary.id);
      } catch {
        // 中文注释：损坏项目不阻塞素材管理，但不把它误报为已知引用。
      }
    }
    return references;
  }

  /** 中文注释：个人预设和视频模板作为当前工作区资产持久化，页面重启后仍可复用。 */
  async listPresets(): Promise<Preset[]> { return this.presetRepository.listPresets(); }
  async savePreset(...args: Parameters<PresetRepository["savePreset"]>): Promise<Preset> { return this.presetRepository.savePreset(...args); }
  async deletePreset(presetId: string): Promise<void> { return this.presetRepository.deletePreset(presetId); }
  async listVideoTemplates(): Promise<VideoTemplate[]> { return this.videoTemplateRepository.listVideoTemplates(); }
  async saveVideoTemplate(template: VideoTemplate): Promise<VideoTemplate> { return this.videoTemplateRepository.saveVideoTemplate(template); }
  async deleteVideoTemplate(templateId: string): Promise<void> { return this.videoTemplateRepository.deleteVideoTemplate(templateId); }

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
