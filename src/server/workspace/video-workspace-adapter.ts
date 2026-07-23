import { pathToFileURL } from "node:url";
import type { VideoWorkspace } from "../../domain/workspace/model";
import type { MediaAsset, MediaImportFile } from "./media-repository";
import { VideoWorkspaceRepository, type VideoWorkspaceSummary } from "./video-workspace-repository";
import { WorkspaceError, type WorkspacePaths } from "./workspace-paths";

export type VideoWorkspaceLoadResult = {
  workspace: VideoWorkspace;
  missingMediaIds: string[];
};

/** 中文注释：适配器将工作区快照与私有素材操作收敛为一组 API，路由和界面不应绕过它访问其他工作区。 */
export class VideoWorkspaceAdapter {
  private readonly repository: VideoWorkspaceRepository;

  constructor(libraryRoot: string) {
    this.repository = new VideoWorkspaceRepository(libraryRoot);
  }

  /** 中文注释：启动时只初始化工作区库根目录，用户不需要选择或知晓实际磁盘位置。 */
  async initialize(): Promise<void> {
    await this.repository.initialize();
  }

  /** 中文注释：迁移入口保留在适配器层，防止界面把旧共享目录当作一个可切换的用户工作区。 */
  async migrateLegacyLibrary(legacyPaths: WorkspacePaths): Promise<void> {
    await this.repository.migrateLegacyLibrary(legacyPaths);
  }

  /** 中文注释：新建工作区只写自己的初始快照，不创建或复用任何其他工作区素材。 */
  async createWorkspace(workspaceId: string, workspace: VideoWorkspace): Promise<void> {
    await this.repository.createWorkspace(workspaceId, workspace);
  }

  /** 中文注释：工作区列表只描述可切换的视频创作单元，不暴露底层目录结构。 */
  async listWorkspaces(): Promise<VideoWorkspaceSummary[]> {
    return this.repository.listWorkspaces();
  }

  /** 中文注释：读取工作区时同时检查其私有素材目录，缺失状态不会波及其他工作区。 */
  async loadWorkspace(workspaceId: string): Promise<VideoWorkspaceLoadResult> {
    const workspace = await this.repository.loadWorkspace(workspaceId);
    const missingMediaIds = await this.repository.getMediaRepository(workspaceId).findMissingMediaIds(
      workspace.videoClips.map((clip) => clip.mediaId),
    );
    return { workspace, missingMediaIds };
  }

  /** 中文注释：恢复从当前工作区自己的最近快照开始，恢复后仍重新计算该工作区的缺失素材状态。 */
  async restoreWorkspaceFromBackup(workspaceId: string): Promise<VideoWorkspaceLoadResult> {
    const workspace = await this.repository.restoreWorkspaceFromBackup(workspaceId);
    const missingMediaIds = await this.repository.getMediaRepository(workspaceId).findMissingMediaIds(
      workspace.videoClips.map((clip) => clip.mediaId),
    );
    return { workspace, missingMediaIds };
  }

  /** 中文注释：路由只依据当前工作区的备份状态展示恢复入口，不暴露磁盘备份路径。 */
  async hasWorkspaceBackup(workspaceId: string): Promise<boolean> {
    return this.repository.hasWorkspaceBackup(workspaceId);
  }

  /** 中文注释：保存只覆盖指定工作区的快照并保留该工作区自己的最近备份。 */
  async saveWorkspace(workspaceId: string, workspace: VideoWorkspace): Promise<void> {
    await this.repository.saveWorkspace(workspaceId, workspace);
  }

  /** 中文注释：重命名移动整个工作区目录，使素材、快照和渲染结果始终归属于同一个视频。 */
  async renameWorkspace(workspaceId: string, nextWorkspaceId: string): Promise<void> {
    await this.repository.renameWorkspace(workspaceId, nextWorkspaceId);
  }

  /** 中文注释：删除工作区只删除其私有目录，其他工作区不共享素材，因此无需跨工作区保护检查。 */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.repository.deleteWorkspace(workspaceId);
  }

  /** 中文注释：导入时直接写入目标工作区的 media 目录，避免素材在 A/B 之间意外出现。 */
  async importMedia(workspaceId: string, file: MediaImportFile): Promise<MediaAsset> {
    return this.repository.getMediaRepository(workspaceId).importMedia(file);
  }

  /** 中文注释：素材列表天然受工作区目录限制，调用方无需再过滤全局素材集合。 */
  async listMedia(workspaceId: string): Promise<MediaAsset[]> {
    return this.repository.getMediaRepository(workspaceId).listMedia();
  }

  async getMediaAsset(workspaceId: string, mediaId: string): Promise<MediaAsset | null> {
    return this.repository.getMediaRepository(workspaceId).getMediaAsset(mediaId);
  }

  /** 中文注释：下载路由只取得指定工作区中素材的真实路径，绝不回退到全局媒体目录。 */
  async getMediaPath(workspaceId: string, mediaId: string): Promise<string | null> {
    return this.repository.getMediaRepository(workspaceId).getMediaPath(mediaId);
  }

  /** 中文注释：重命名素材只更新所在工作区的元数据，不会改变其他工作区的同名文件。 */
  async renameMedia(workspaceId: string, mediaId: string, name: string): Promise<MediaAsset> {
    return this.repository.getMediaRepository(workspaceId).renameMedia(mediaId, name);
  }

  /** 中文注释：重新关联与撤销都限定在指定工作区，保证错误替换不会影响另一条视频。 */
  async relinkMedia(workspaceId: string, mediaId: string, file: MediaImportFile): Promise<MediaAsset> {
    return this.repository.getMediaRepository(workspaceId).relinkMedia(mediaId, file);
  }

  async undoRelinkMedia(workspaceId: string, mediaId: string): Promise<MediaAsset> {
    return this.repository.getMediaRepository(workspaceId).undoRelinkMedia(mediaId);
  }

  /** 中文注释：当前工作区的时间轴仍引用素材时禁止删除；不扫描其他工作区，因为素材没有共享关系。 */
  async deleteMedia(workspaceId: string, mediaId: string): Promise<void> {
    const workspace = await this.repository.loadWorkspace(workspaceId);
    if (workspace.videoClips.some((clip) => clip.mediaId === mediaId)) {
      throw new WorkspaceError("media_in_use", "素材仍被当前视频工作区引用");
    }
    await this.repository.getMediaRepository(workspaceId).deleteMedia(mediaId);
  }

  /** 中文注释：渲染来源只解析指定工作区的私有媒体路径，防止导出任务读取其他视频的文件。 */
  async getMediaSources(workspaceId: string, mediaIds: string[]): Promise<Record<string, string>> {
    const media = this.repository.getMediaRepository(workspaceId);
    const sources: Record<string, string> = {};
    for (const mediaId of [...new Set(mediaIds)]) {
      const path = await media.getMediaPath(mediaId);
      if (path) sources[mediaId] = pathToFileURL(path).href;
    }
    return sources;
  }

  /** 中文注释：仅在基础设施或迁移测试中暴露私有路径，用户界面不得显示此信息。 */
  getWorkspacePaths(workspaceId: string): WorkspacePaths {
    return this.repository.getWorkspacePaths(workspaceId);
  }
}
