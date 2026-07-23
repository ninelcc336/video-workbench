import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EditProject } from "../../domain/project/model";
import { validateProject } from "../../domain/project/validation";
import { MediaRepository } from "./media-repository";
import { ProjectRepository } from "./project-repository";
import {
  assertSafePathSegment,
  getWorkspacePaths,
  mediaAssetPath,
  mediaMetadataPath,
  type WorkspacePaths,
  WorkspaceError,
} from "./workspace-paths";

export type VideoWorkspaceSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

/** 中文注释：工作区名称既是用户可读名称也是目录名，统一处理 Windows 文件系统的危险输入。 */
function normalizeWorkspaceId(workspaceId: string): string {
  const normalized = workspaceId.trim();
  assertSafePathSegment(normalized, "工作区名称");
  const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
  const baseName = normalized.split(".")[0] ?? normalized;
  if (/[<>:"|?*\u0000-\u001f]/u.test(normalized) || /[. ]$/u.test(normalized) || windowsReservedName.test(baseName)) {
    throw new WorkspaceError("unsafe_path", "工作区名称包含 Windows 不支持的字符或保留名");
  }
  return normalized;
}

/** 中文注释：视频工作区仓储以目录作为隔离边界，快照、素材和导出文件均不会跨工作区读取。 */
export class VideoWorkspaceRepository {
  private readonly libraryDirectory: string;

  constructor(libraryRoot: string) {
    this.libraryDirectory = resolve(libraryRoot, "video-workspaces");
  }

  /** 中文注释：初始化只创建工作区库根目录，不创建共享素材目录。 */
  async initialize(): Promise<void> {
    await mkdir(this.libraryDirectory, { recursive: true });
  }

  /** 中文注释：返回一个工作区的私有路径集合，MediaRepository 只能在该目录内解析素材。 */
  getWorkspacePaths(workspaceId: string): WorkspacePaths {
    return getWorkspacePaths(this.workspaceDirectory(workspaceId));
  }

  /** 中文注释：媒体仓储按工作区实例化，任何同名或同 ID 素材都不会落入其他工作区目录。 */
  getMediaRepository(workspaceId: string): MediaRepository {
    return new MediaRepository(this.getWorkspacePaths(workspaceId));
  }

  /** 中文注释：新建工作区同时创建私有媒体与导出目录，首个快照不生成无意义备份。 */
  async createWorkspace(workspaceId: string, workspace: EditProject): Promise<void> {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    if (await this.findExistingWorkspaceId(normalizedId)) {
      throw new WorkspaceError("project_exists", `视频工作区“${normalizedId}”已存在`);
    }
    this.assertValidWorkspace(workspace);
    await this.ensureWorkspaceDirectories(normalizedId);
    await this.writeSnapshot(normalizedId, workspace, false);
    await this.writeWorkspaceName(normalizedId, normalizedId);
  }

  /** 中文注释：保存时将上一个可读取快照作为最近备份，保证单个工作区的恢复不会影响其他工作区。 */
  async saveWorkspace(workspaceId: string, workspace: EditProject): Promise<void> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    this.assertValidWorkspace(workspace);
    await this.ensureWorkspaceDirectories(normalizedId);
    await this.writeSnapshot(normalizedId, workspace, true);
  }

  /** 中文注释：加载只读取当前工作区快照，素材存在性由调用方通过该工作区的媒体仓储检查。 */
  async loadWorkspace(workspaceId: string): Promise<EditProject> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    return this.readWorkspaceSnapshot(normalizedId, this.snapshotPath(normalizedId), false);
  }

  /** 中文注释：仅从最近成功保存的备份读取工作区，读取本身不会覆盖损坏的正式快照。 */
  async loadWorkspaceFromBackup(workspaceId: string): Promise<EditProject> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    return this.readWorkspaceSnapshot(normalizedId, this.backupSnapshotPath(normalizedId), true);
  }

  /** 中文注释：恢复只用已校验的备份替换正式快照，绝不把损坏版本反写为新的备份。 */
  async restoreWorkspaceFromBackup(workspaceId: string): Promise<EditProject> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    const workspace = await this.loadWorkspaceFromBackup(normalizedId);
    const snapshot = this.snapshotPath(normalizedId);
    const temporary = `${snapshot}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");
      await this.replaceFile(temporary, snapshot);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    return workspace;
  }

  /** 中文注释：恢复入口先确认备份文件真实存在，避免界面展示一个无法完成的恢复操作。 */
  async hasWorkspaceBackup(workspaceId: string): Promise<boolean> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    try {
      return (await stat(this.backupSnapshotPath(normalizedId))).isFile();
    } catch {
      return false;
    }
  }

  /** 中文注释：统一校验正式快照与备份快照，保证两者都遵循同一份工作区数据约束。 */
  private async readWorkspaceSnapshot(workspaceId: string, snapshotPath: string, isBackup: boolean): Promise<EditProject> {
    let raw: string;
    try {
      raw = await readFile(snapshotPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceError(isBackup ? "backup_not_found" : "project_not_found", isBackup
          ? `视频工作区“${workspaceId}”没有可用备份`
          : `找不到视频工作区“${workspaceId}”`);
      }
      throw error;
    }
    try {
      const workspace: unknown = JSON.parse(raw);
      this.assertValidWorkspace(workspace);
      return workspace;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("corrupt_project", `视频工作区“${workspaceId}”的${isBackup ? "备份" : "数据"}已损坏，无法读取`, error);
    }
  }

  /** 中文注释：重命名只修改用户可见名称，私有目录 ID 不移动，预览中的媒体文件不会因 Windows 文件锁而中断。 */
  async renameWorkspace(workspaceId: string, nextWorkspaceId: string): Promise<void> {
    const sourceId = await this.resolveExistingWorkspaceId(workspaceId);
    const nextName = normalizeWorkspaceId(nextWorkspaceId);
    const duplicate = (await this.listWorkspaces()).find((workspace) => (
      workspace.id !== sourceId && workspace.name.localeCompare(nextName, "en-US", { sensitivity: "accent" }) === 0
    ));
    if (duplicate) throw new WorkspaceError("project_exists", `视频工作区“${nextName}”已存在`);
    await this.writeWorkspaceName(sourceId, nextName);
  }

  /** 中文注释：删除工作区会删除其私有内容；由于素材不共享，无需扫描其他工作区引用。 */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    const normalizedId = await this.resolveExistingWorkspaceId(workspaceId);
    try {
      await rm(this.workspaceDirectory(normalizedId), { force: false, recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceError("project_not_found", `找不到视频工作区“${normalizedId}”`);
      }
      throw error;
    }
  }

  /** 中文注释：列表以工作区快照的更新时间排序，让最近编辑的视频工作区优先显示。 */
  async listWorkspaces(): Promise<VideoWorkspaceSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.libraryDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const summaries: VideoWorkspaceSummary[] = [];
    for (const name of names) {
      const snapshot = this.snapshotPath(name);
      try {
        const details = await stat(snapshot);
        if (details.isFile()) summaries.push({ id: name, name: await this.readWorkspaceName(name), updatedAt: details.mtime.toISOString() });
      } catch {
        // 中文注释：不完整迁移目录不作为可打开的工作区展示，避免用户进入无法恢复的空状态。
      }
    }
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  /** 中文注释：旧共享项目库迁移为独立目录；同一旧素材按引用工作区复制而不是继续共享。 */
  async migrateLegacyLibrary(legacyPaths: WorkspacePaths): Promise<void> {
    await this.initialize();
    if ((await this.listWorkspaces()).length > 0) {
      throw new WorkspaceError("project_library_unavailable", "目标工作区库已存在数据，不能覆盖迁移");
    }
    const legacyProjects = new ProjectRepository(legacyPaths);
    const legacyMedia = new MediaRepository(legacyPaths);
    const createdWorkspaceIds: string[] = [];
    try {
      for (const summary of await legacyProjects.listProjects()) {
        const workspace = await legacyProjects.loadProject(summary.id);
        await this.createWorkspace(summary.id, workspace);
        createdWorkspaceIds.push(summary.id);
        const destinationPaths = this.getWorkspacePaths(summary.id);
        await mkdir(destinationPaths.media, { recursive: true });
        for (const mediaId of [...new Set(workspace.videoClips.map((clip) => clip.mediaId))]) {
          const asset = await legacyMedia.getMediaAsset(mediaId);
          const sourcePath = await legacyMedia.getMediaPath(mediaId);
          if (!asset || !sourcePath) continue;
          const extension = asset.fileName.slice(asset.id.length);
          await copyFile(sourcePath, mediaAssetPath(destinationPaths, mediaId, extension));
          await copyFile(mediaMetadataPath(legacyPaths, mediaId), mediaMetadataPath(destinationPaths, mediaId));
        }
      }
    } catch (error) {
      // 中文注释：迁移尚未成功前清理本次创建的所有目标目录，旧共享库不写入且下次仍可安全重试。
      await Promise.all(createdWorkspaceIds.map((workspaceId) => rm(this.workspaceDirectory(workspaceId), { force: true, recursive: true })));
      throw error;
    }
  }

  /** 中文注释：工作区目录仅由经过校验的名称生成，避免名称绕过隔离根目录。 */
  private workspaceDirectory(workspaceId: string): string {
    return join(this.libraryDirectory, normalizeWorkspaceId(workspaceId));
  }

  /** 中文注释：快照文件固定命名，目录名承担工作区身份，避免在工作区内部再引入项目标识。 */
  private snapshotPath(workspaceId: string): string {
    return join(this.workspaceDirectory(workspaceId), "workspace.json");
  }

  /** 中文注释：备份与快照同目录保存，工作区恢复不需要也不会读取其他工作区文件。 */
  private backupSnapshotPath(workspaceId: string): string {
    return `${this.snapshotPath(workspaceId)}.bak`;
  }

  /** 中文注释：显示名称单独保存，目录 ID 只承担内部存储定位，用户重命名无需移动正在预览的素材文件。 */
  private workspaceMetadataPath(workspaceId: string): string {
    return join(this.workspaceDirectory(workspaceId), "workspace.meta.json");
  }

  /** 中文注释：旧工作区没有元数据时回退目录 ID，保证升级后仍能正常列出和重命名。 */
  private async readWorkspaceName(workspaceId: string): Promise<string> {
    try {
      const metadata: unknown = JSON.parse(await readFile(this.workspaceMetadataPath(workspaceId), "utf8"));
      if (metadata && typeof metadata === "object" && typeof (metadata as { name?: unknown }).name === "string") {
        return normalizeWorkspaceId((metadata as { name: string }).name);
      }
    } catch {
      // 中文注释：显示名称元数据缺失或损坏不阻止工作区读取，保留目录 ID 作为安全回退。
    }
    return workspaceId;
  }

  /** 中文注释：元数据与快照采用同目录临时文件替换，避免重命名过程中出现半写入的名称。 */
  private async writeWorkspaceName(workspaceId: string, name: string): Promise<void> {
    const normalizedName = normalizeWorkspaceId(name);
    const metadata = this.workspaceMetadataPath(workspaceId);
    const temporary = `${metadata}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify({ name: normalizedName }, null, 2)}\n`, "utf8");
      await this.replaceFile(temporary, metadata);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  /** 中文注释：创建私有基础目录时保留 MediaRepository 所需的媒体目录与未来导出目录。 */
  private async ensureWorkspaceDirectories(workspaceId: string): Promise<void> {
    const paths = this.getWorkspacePaths(workspaceId);
    await Promise.all([mkdir(paths.root, { recursive: true }), mkdir(paths.media, { recursive: true }), mkdir(paths.renders, { recursive: true })]);
  }

  /** 中文注释：快照采用同目录临时文件替换，并在更新前保留单个最近备份。 */
  private async writeSnapshot(workspaceId: string, workspace: EditProject, keepBackup: boolean): Promise<void> {
    const snapshot = this.snapshotPath(workspaceId);
    const temporary = `${snapshot}.tmp`;
    const backup = `${snapshot}.bak`;
    const backupTemporary = `${backup}.tmp`;
    try {
      if (keepBackup) {
        try {
          await copyFile(snapshot, backupTemporary);
          await this.replaceFile(backupTemporary, backup);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await writeFile(temporary, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");
      await this.replaceFile(temporary, snapshot);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
      await rm(backupTemporary, { force: true }).catch(() => undefined);
    }
  }

  /** 中文注释：解析大小写不敏感名称，确保 Windows 与测试环境对工作区唯一性的判断一致。 */
  private async resolveExistingWorkspaceId(workspaceId: string): Promise<string> {
    return await this.findExistingWorkspaceId(workspaceId) ?? normalizeWorkspaceId(workspaceId);
  }

  /** 中文注释：目录扫描集中实现工作区名称冲突检测，避免依赖底层文件系统的大小写策略。 */
  private async findExistingWorkspaceId(workspaceId: string): Promise<string | null> {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    let names: string[];
    try {
      names = await readdir(this.libraryDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return names.find((name) => name.localeCompare(normalizedId, "en-US", { sensitivity: "accent" }) === 0) ?? null;
  }

  /** 中文注释：工作区快照暂复用成熟的编辑快照结构，但从此只在视频工作区边界内持久化。 */
  private assertValidWorkspace(value: unknown): asserts value is EditProject {
    const validation = validateProject(value);
    if (!validation.valid) {
      throw new WorkspaceError("invalid_project", `视频工作区数据无效：${validation.errors.map((error) => error.message).join("；")}`, validation);
    }
  }

  /** 中文注释：Windows 替换已有快照失败时先删除目标，再完成同目录原子替换步骤。 */
  private async replaceFile(temporary: string, destination: string): Promise<void> {
    try {
      await rename(temporary, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
      await rm(destination, { force: true });
      await rename(temporary, destination);
    }
  }
}
