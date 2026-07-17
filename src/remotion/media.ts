export type MediaSources = Record<string, string>;

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
