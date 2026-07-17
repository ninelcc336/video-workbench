export type ImportedMediaAsset = {
  id: string;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
};

/** 中文注释：浏览器只上传 File，项目保存服务端返回的资产 ID，不保存 ObjectURL。 */
export async function importMediaFile(
  file: File,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<ImportedMediaAsset> {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetcher("/api/workspace/media", { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "视频素材导入失败");
  }
  return response.json() as Promise<ImportedMediaAsset>;
}
