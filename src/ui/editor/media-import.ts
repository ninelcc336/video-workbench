import type { VideoDimensions } from "../../domain/editor/commands";

export type ImportedMediaAsset = {
  id: string;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
  durationInSeconds?: number;
  fps?: number;
  fpsWasFallback?: boolean;
} & VideoDimensions;

/** 中文注释：工作区服务只保存资产元数据，浏览器在本次导入中补充源视频尺寸。 */
type ImportedMediaResponse = Omit<ImportedMediaAsset, keyof VideoDimensions>;

/** 中文注释：可注入尺寸读取器，使浏览器元数据读取与导入网络请求能够独立测试。 */
export type VideoDimensionReader = (file: File) => Promise<VideoDimensions & {
  durationInSeconds?: number;
  fps?: number;
  fpsWasFallback?: boolean;
}>;

/** 中文注释：通过浏览器视频元数据读取源素材方向，避免用文件名或扩展名猜测横竖屏。 */
export function readVideoDimensions(file: File): Promise<VideoDimensions & {
  durationInSeconds: number;
  fps: number;
  fpsWasFallback: boolean;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = () => {
      const dimensions = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationInSeconds: video.duration,
        // 中文注释：浏览器原生 video 元数据不稳定地暴露帧率，无法读取时按规格安全回退 30fps。
        fps: 30,
        fpsWasFallback: true,
      };
      cleanup();
      if (dimensions.width <= 0 || dimensions.height <= 0 || !Number.isFinite(dimensions.durationInSeconds) || dimensions.durationInSeconds <= 0) {
        reject(new Error("无法读取视频元数据"));
        return;
      }
      resolve(dimensions);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("无法读取视频尺寸"));
    };
    video.preload = "metadata";
    video.src = objectUrl;
  });
}

/** 中文注释：浏览器只上传 File，项目保存服务端返回的资产 ID，不保存 ObjectURL。 */
export async function importMediaFile(
  file: File,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  readDimensions: VideoDimensionReader = readVideoDimensions,
  endpoint = "/api/workspace/media",
): Promise<ImportedMediaAsset> {
  const dimensions = await readDimensions(file);
  const form = new FormData();
  form.append("file", file, file.name);
  if (dimensions.durationInSeconds !== undefined) form.append("durationInSeconds", String(dimensions.durationInSeconds));
  if (dimensions.width !== undefined) form.append("width", String(dimensions.width));
  if (dimensions.height !== undefined) form.append("height", String(dimensions.height));
  if (dimensions.fps !== undefined) form.append("fps", String(dimensions.fps));
  if (dimensions.fpsWasFallback !== undefined) form.append("fpsWasFallback", String(dimensions.fpsWasFallback));
  const response = await fetcher(endpoint, { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "视频素材导入失败");
  }
  const asset = await response.json() as ImportedMediaResponse;
  // 中文注释：尺寸只服务于本次导入后的项目匹配，不需要由工作区资产仓储重复持久化。
  return { ...asset, ...dimensions };
}
