import { randomUUID } from "node:crypto";
import {
  copyFile,
  readFile,
  readdir,
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

export type MediaImportFile = {
  path?: string;
  buffer?: Uint8Array;
  originalName?: string;
  originalname?: string;
  mimeType?: string;
  mimetype?: string;
  size?: number;
};

export type MediaAsset = {
  id: string;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
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

/** 中文注释：素材仓储负责把外部文件复制进工作区，并维护可恢复的素材元数据。 */
export class MediaRepository {
  public readonly paths: WorkspacePaths;

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

    const asset: MediaAsset = {
      id,
      originalName,
      fileName,
      relativePath: join("media", fileName).replaceAll("\\", "/"),
      mimeType: file.mimeType ?? file.mimetype ?? "application/octet-stream",
      sizeBytes,
      importedAt: new Date().toISOString(),
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
