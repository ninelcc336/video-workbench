export type MediaSources = Record<string, string>;

// 中文注释：统一在组合入口检查素材，避免预览和导出分别处理缺失素材。
export function assertMediaSource(
  mediaId: string,
  mediaSources: MediaSources,
): string {
  const source = mediaSources[mediaId];

  if (!source) {
    throw new Error(`缺少视频素材：${mediaId}`);
  }

  return source;
}
