import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  copyFile,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import {
  extensionFromMediaName,
  getWorkspacePaths,
  mediaAssetPath,
  mediaMetadataPath,
  type WorkspacePaths,
} from "./workspace-paths";
import { WorkspaceError as WorkspaceErrorClass } from "./workspace-paths";

const execFileAsync = promisify(execFile);

export type MediaImportFile = {
  path?: string;
  buffer?: Uint8Array;
  originalName?: string;
  originalname?: string;
  mimeType?: string;
  mimetype?: string;
  size?: number;
  /** 中文注释：浏览器或 ffprobe 读取的真实视频元数据，导入时随文件一起冻结。 */
  metadata?: VideoMetadata;
};

export type VideoMetadata = {
  durationInSeconds: number;
  width: number;
  height: number;
  fps: number;
  /** 中文注释：无法读取帧率时明确记录回退，界面可以向用户解释 30fps 来源。 */
  fpsWasFallback?: boolean;
};

export type MediaAsset = {
  id: string;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
  durationInSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  fpsWasFallback?: boolean;
};

function isMediaAsset(value: unknown): value is MediaAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return ["id", "originalName", "fileName", "relativePath", "mimeType", "sizeBytes", "importedAt"].every(
    (key) => key in asset,
  );
}

async function writeMetadata(paths: WorkspacePaths, asset: MediaAsset): Promise<void> {
  const metadataPath = mediaMetadataPath(paths, asset.id);
  const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(asset, null, 2)}\n`, "utf8");
    await writeFile(metadataPath, await readFile(temporaryPath));
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/** 中文注释：服务端优先用 ffprobe 读取真实文件元数据，浏览器已上传的元数据则作为显式结果优先级更高。 */
async function readVideoMetadata(filePath: string): Promise<VideoMetadata | undefined> {
  try {
    const result = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate:format=duration",
      "-of", "json", filePath,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(result.stdout) as {
      streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const durationInSeconds = Number(parsed.format?.duration);
    const [numerator, denominator] = (stream?.r_frame_rate ?? "").split("/").map(Number);
    const fps = denominator > 0 ? numerator / denominator : Number.NaN;
    if (!stream?.width || !stream.height || !Number.isFinite(durationInSeconds) || durationInSeconds <= 0) return undefined;
    return {
      durationInSeconds,
      width: stream.width,
      height: stream.height,
      fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
      fpsWasFallback: !Number.isFinite(fps) || fps <= 0,
    };
  } catch {
    // 中文注释：开发环境可能没有 ffprobe；浏览器上传的元数据仍可完成正常导入。
    return undefined;
  }
}

/** 中文注释：素材仓储负责把外部文件复制进工作区，并维护可恢复的素材元数据。 */
export class MediaRepository {
  public readonly paths: WorkspacePaths;
  private readonly relinkBackups = new Map<string, { path: string; asset: MediaAsset }>();

  constructor(pathsOrRoot: WorkspacePaths | string) {
    this.paths = typeof pathsOrRoot === "string" ? getWorkspacePaths(pathsOrRoot) : pathsOrRoot;
  }

  async importMedia(file: MediaImportFile): Promise<MediaAsset> {
    const originalName = basename(file.originalName ?? file.originalname ?? "未命名素材");
    const extension = extensionFromMediaName(originalName);
    const id = randomUUID();
    const fileName = `${id}${extension}`;
    const destination = mediaAssetPath(this.paths, id, extension);

    if (!file.path && !file.buffer) {
      throw new WorkspaceErrorClass("invalid_media", "未提供可导入的素材文件");
    }

    let sizeBytes = file.size ?? 0;
    try {
      if (file.path) {
        const sourceStats = await stat(file.path);
        if (!sourceStats.isFile()) {
          throw new WorkspaceErrorClass("invalid_media", "导入的素材路径不是文件");
        }
        sizeBytes = sourceStats.size;
        await copyFile(file.path, destination);
      } else {
        await writeFile(destination, file.buffer as Uint8Array);
        sizeBytes = (file.buffer as Uint8Array).byteLength;
      }
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined);
      if (error instanceof WorkspaceErrorClass) throw error;
      throw new WorkspaceErrorClass("invalid_media", "无法复制素材文件，请检查文件是否可读", error);
    }

    const probedMetadata = await readVideoMetadata(destination);
    // 中文注释：浏览器无法可靠提供帧率时，优先采用服务端 ffprobe 的帧率；不可用才保留 30fps 回退值。
    const metadata = file.metadata && (!file.metadata.fpsWasFallback || !probedMetadata)
      ? file.metadata
      : file.metadata && probedMetadata
        ? { ...file.metadata, fps: probedMetadata.fps, fpsWasFallback: probedMetadata.fpsWasFallback }
        : probedMetadata;
    const asset: MediaAsset = {
      id,
      originalName,
      fileName,
      relativePath: join("media", fileName).replaceAll("\\", "/"),
      mimeType: file.mimeType ?? file.mimetype ?? "application/octet-stream",
      sizeBytes,
      importedAt: new Date().toISOString(),
      ...(metadata ?? {}),
    };
    await writeMetadata(this.paths, asset);
    return asset;
  }

  async hasMedia(mediaId: string): Promise<boolean> {
    return (await this.findMedia(mediaId)) !== null;
  }

  /** 中文注释：服务端渲染和媒体下载都通过元数据解析真实文件，禁止把浏览器临时 URL 当作素材引用。 */
  async getMediaPath(mediaId: string): Promise<string | null> {
    const asset = await this.findMedia(mediaId);
    if (!asset) return null;
    return mediaAssetPath(this.paths, mediaId, asset.fileName.slice(mediaId.length));
  }

  /** 中文注释：向工作区路由暴露资产元数据，读取项目时可据此判断素材是否缺失。 */
  async getMediaAsset(mediaId: string): Promise<MediaAsset | null> {
    return this.findMedia(mediaId);
  }

  async findMissingMediaIds(mediaIds: string[]): Promise<string[]> {
    const missing: string[] = [];
    for (const mediaId of [...new Set(mediaIds)]) {
      if (!(await this.hasMedia(mediaId))) missing.push(mediaId);
    }
    return missing;
  }

  /** 中文注释：列出工作区中的全部素材，供素材管理界面显示文件名、规格和引用状态。 */
  async listMedia(): Promise<MediaAsset[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.paths.media);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const assets: MediaAsset[] = [];
    for (const fileName of fileNames.filter((name) => name.endsWith(".asset.json"))) {
      const mediaId = fileName.slice(0, -".asset.json".length);
      const asset = await this.findMedia(mediaId);
      if (asset) assets.push(asset);
    }
    return assets.sort((left, right) => left.originalName.localeCompare(right.originalName, "zh-CN"));
  }

  /** 中文注释：重命名只更新展示字段，稳定媒体 ID 和项目引用保持不变。 */
  async renameMedia(mediaId: string, originalName: string): Promise<MediaAsset> {
    const asset = await this.requireMedia(mediaId);
    const next = { ...asset, originalName: basename(originalName) };
    await writeMetadata(this.paths, next);
    return next;
  }

  /** 中文注释：重新关联沿用原媒体 ID，先写新文件再更新元数据，失败时保留旧引用。 */
  async relinkMedia(mediaId: string, file: MediaImportFile): Promise<MediaAsset> {
    const oldAsset = await this.requireMedia(mediaId);
    const originalName = basename(file.originalName ?? file.originalname ?? oldAsset.originalName);
    const extension = extensionFromMediaName(originalName) || oldAsset.fileName.slice(mediaId.length);
    const destination = mediaAssetPath(this.paths, mediaId, extension);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const oldPath = mediaAssetPath(this.paths, mediaId, oldAsset.fileName.slice(mediaId.length));
    const backupPath = `${oldPath}.${randomUUID()}.relink.bak`;
    try {
      await copyFile(oldPath, backupPath);
      if (file.path) await copyFile(file.path, temporary);
      else if (file.buffer) await writeFile(temporary, file.buffer);
      else throw new WorkspaceErrorClass("invalid_media", "未提供可重新关联的素材文件");
      const sizeBytes = (await stat(temporary)).size;
      const probedMetadata = await readVideoMetadata(temporary);
      await rename(temporary, destination);
      if (oldAsset.fileName !== `${mediaId}${extension}`) {
        await rm(mediaAssetPath(this.paths, mediaId, oldAsset.fileName.slice(mediaId.length)), { force: true });
      }
      const next: MediaAsset = {
        ...oldAsset,
        originalName,
        fileName: `${mediaId}${extension}`,
        relativePath: join("media", `${mediaId}${extension}`).replaceAll("\\", "/"),
        sizeBytes,
        importedAt: new Date().toISOString(),
        ...(file.metadata && (!file.metadata.fpsWasFallback || !probedMetadata)
          ? file.metadata
          : file.metadata && probedMetadata
            ? { ...file.metadata, fps: probedMetadata.fps, fpsWasFallback: probedMetadata.fpsWasFallback }
            : probedMetadata ?? {}),
      };
      await writeMetadata(this.paths, next);
      this.relinkBackups.set(mediaId, { path: backupPath, asset: oldAsset });
      return next;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof WorkspaceErrorClass) throw error;
      throw new WorkspaceErrorClass("invalid_media", "重新关联素材失败，请检查文件是否可读", error);
    }
  }

  /** 中文注释：重新关联的撤销只恢复上一次替换，确保用户可以在误选文件后回到原素材。 */
  async undoRelinkMedia(mediaId: string): Promise<MediaAsset> {
    const backup = this.relinkBackups.get(mediaId);
    if (!backup) throw new WorkspaceErrorClass("media_not_found", `素材“${mediaId}”没有可撤销的重新关联`);
    const current = await this.requireMedia(mediaId);
    await copyFile(backup.path, mediaAssetPath(this.paths, mediaId, backup.asset.fileName.slice(mediaId.length)));
    if (current.fileName !== backup.asset.fileName) await rm(mediaAssetPath(this.paths, mediaId, current.fileName.slice(mediaId.length)), { force: true });
    await writeMetadata(this.paths, backup.asset);
    await rm(backup.path, { force: true });
    this.relinkBackups.delete(mediaId);
    return backup.asset;
  }

  /** 中文注释：实际删除由适配器完成引用检查后调用，仓储本身只负责文件清理。 */
  async deleteMedia(mediaId: string): Promise<void> {
    const asset = await this.requireMedia(mediaId);
    await rm(mediaAssetPath(this.paths, mediaId, asset.fileName.slice(mediaId.length)), { force: false });
    await rm(mediaMetadataPath(this.paths, mediaId), { force: true });
  }

  private async requireMedia(mediaId: string): Promise<MediaAsset> {
    const asset = await this.findMedia(mediaId);
    if (!asset) throw new WorkspaceErrorClass("media_not_found", `找不到视频素材“${mediaId}”`);
    return asset;
  }

  private async findMedia(mediaId: string): Promise<MediaAsset | null> {
    let metadata: MediaAsset | null = null;
    try {
      const parsed: unknown = JSON.parse(await readFile(mediaMetadataPath(this.paths, mediaId), "utf8"));
      if (isMediaAsset(parsed)) metadata = parsed;
    } catch {
      // 中文注释：元数据损坏时继续检查实际文件，项目读取仍可给出素材存在性结果。
    }

    if (metadata) {
      try {
        await stat(mediaAssetPath(this.paths, mediaId, metadata.fileName.slice(mediaId.length)));
        return metadata;
      } catch {
        return null;
      }
    }

    try {
      const entries = await readdir(this.paths.media);
      const mediaFile = entries.find(
        (entry) => entry.startsWith(`${mediaId}.`) && !entry.endsWith(".asset.json"),
      );
      if (!mediaFile) return null;
      await stat(join(this.paths.media, mediaFile));
      return null;
    } catch {
      return null;
    }
  }
}
