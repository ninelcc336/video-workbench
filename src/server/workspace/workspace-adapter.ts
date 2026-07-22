import type { EditProject } from "../../domain/project/model";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
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

export { WorkspaceError } from "./workspace-paths";
export type { MediaAsset, MediaImportFile } from "./media-repository";
export type { ProjectSummary } from "./project-repository";

export type ProjectLoadResult = {
  project: EditProject;
  missingMediaIds: string[];
};

export type FixedProjectLibraryOptions = {
  /** 中文注释：应用根目录仅供启动配置与测试计算固定库位置，不暴露给用户界面。 */
  applicationRoot?: string;
  /** 中文注释：测试或宿主可显式覆盖固定库位置，生产环境始终使用应用根目录下的内部目录。 */
  libraryRoot?: string;
  /** 中文注释：旧版最近工作区只作为一次性兼容来源，不再构成可切换的用户状态。 */
  legacyRoots?: string[];
};

/** 中文注释：固定项目库目录属于应用内部实现，用户不需要也不能选择该目录。 */
export function getFixedProjectLibraryRoot(applicationRoot = process.cwd()): string {
  return resolve(applicationRoot, "workspace");
}

/** 中文注释：检查某个目录是否已有用户资产；只有真正存在资产时才跳过旧数据迁移。 */
async function hasPersistedLibraryData(paths: WorkspacePaths): Promise<boolean> {
  for (const directory of [paths.projects, paths.media, paths.presets, paths.videoTemplates, paths.renders]) {
    try {
      if ((await readdir(directory)).length > 0) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}

/** 中文注释：迁移前验证所有项目，避免把损坏的旧数据静默变成空项目库。 */
async function validateMigratedProjects(paths: WorkspacePaths): Promise<void> {
  const repository = new ProjectRepository(paths);
  for (const project of await repository.listProjects()) {
    await repository.loadProject(project.id);
  }
}

/** 中文注释：适配器把编辑器看到的工作区能力收拢起来，未来可替换为云端实现。 */
export class WorkspaceAdapter {
  private rootPath: string;
  private paths: WorkspacePaths;
  private projectRepository: ProjectRepository;
  private mediaRepository: MediaRepository;
  private presetRepository: PresetRepository;
  private videoTemplateRepository: VideoTemplateRepository;

  constructor(rootPathOrPaths: string | WorkspacePaths) {
    this.rootPath = typeof rootPathOrPaths === "string" ? rootPathOrPaths : rootPathOrPaths.root;
    this.paths = typeof rootPathOrPaths === "string" ? getWorkspacePaths(rootPathOrPaths) : rootPathOrPaths;
    this.projectRepository = new ProjectRepository(this.paths);
    this.mediaRepository = new MediaRepository(this.paths);
    this.presetRepository = new PresetRepository(this.paths);
    this.videoTemplateRepository = new VideoTemplateRepository(this.paths);
  }

  async createWorkspace(rootPath = this.rootPath): Promise<void> {
    const paths = getWorkspacePaths(rootPath);
    await ensureWorkspaceDirectories(paths);
    this.rootPath = paths.root;
    this.paths = paths;
    this.projectRepository = new ProjectRepository(paths);
    this.mediaRepository = new MediaRepository(paths);
    this.presetRepository = new PresetRepository(paths);
    this.videoTemplateRepository = new VideoTemplateRepository(paths);
  }

  /** 中文注释：初始化固定项目库；迁移使用独立暂存目录，旧数据始终保留到复制和校验成功以后。 */
  async initializeFixedProjectLibrary(legacyRoots: string[] = []): Promise<void> {
    const libraryPaths = getWorkspacePaths(this.rootPath);
    if (await hasPersistedLibraryData(libraryPaths)) {
      await ensureWorkspaceDirectories(libraryPaths);
      return;
    }

    const legacyRoot = (await Promise.all(
      legacyRoots
        .map((root) => resolve(root))
        .filter((root) => root !== libraryPaths.root)
        .map(async (root) => ({ root, hasData: await hasPersistedLibraryData(getWorkspacePaths(root)) })),
    )).find((candidate) => candidate.hasData)?.root;

    if (!legacyRoot) {
      await ensureWorkspaceDirectories(libraryPaths);
      return;
    }

    const stagingRoot = `${libraryPaths.root}.migration-${crypto.randomUUID()}`;
    const stagingPaths = getWorkspacePaths(stagingRoot);
    try {
      await mkdir(stagingRoot, { recursive: false });
      const legacyPaths = getWorkspacePaths(legacyRoot);
      for (const [source, destination] of [
        [legacyPaths.projects, stagingPaths.projects],
        [legacyPaths.media, stagingPaths.media],
        [legacyPaths.presets, stagingPaths.presets],
        [legacyPaths.videoTemplates, stagingPaths.videoTemplates],
        [legacyPaths.renders, stagingPaths.renders],
      ] as const) {
        try {
          // 中文注释：文件名和 JSON 内的素材 ID 原样复制，项目与共享素材之间的引用无需重写。
          await cp(source, destination, { recursive: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await ensureWorkspaceDirectories(stagingPaths);
      await validateMigratedProjects(stagingPaths);
      // 中文注释：固定目录没有用户资产时才会被替换，避免覆盖已初始化的项目库。
      await rm(libraryPaths.root, { force: true, recursive: true });
      await cp(stagingRoot, libraryPaths.root, { recursive: true });
    } catch (error) {
      throw error instanceof WorkspaceError
        ? error
        : new WorkspaceError("project_library_unavailable", "迁移旧本地项目库失败，请检查旧数据后重试", error);
    } finally {
      await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined);
    }
    await this.createWorkspace(libraryPaths.root);
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
        // 中文注释：损坏项目无法可靠解析引用，保守阻止删除以免素材恢复后发现源文件已丢失。
        references.push(summary.id);
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

/** 中文注释：固定项目库的唯一启动入口，兼容读取旧目录型数据但不重新引入目录切换。 */
export async function bootstrapFixedProjectLibrary(options: FixedProjectLibraryOptions = {}): Promise<WorkspaceAdapter> {
  const rootPath = options.libraryRoot ?? getFixedProjectLibraryRoot(options.applicationRoot);
  const adapter = createWorkspaceAdapter(rootPath);
  await adapter.initializeFixedProjectLibrary(options.legacyRoots);
  return adapter;
}

/** 中文注释：提供计划中约定的独立工作区初始化入口，实际能力仍由同一个适配器承载。 */
export async function createWorkspace(rootPath: string): Promise<void> {
  await createWorkspaceAdapter(rootPath).createWorkspace();
}
