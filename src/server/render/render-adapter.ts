import { renderMedia, selectComposition } from "@remotion/renderer";
import type { EditProject } from "../../domain/project/model";
import { getCompositionDurationInFrames } from "../../remotion/EditorComposition";
import { getCompositionMediaSources } from "../../remotion/EditorComposition";
import type { MediaSources } from "../../remotion/media";
import { getRemotionServeUrl, type RemotionBundleFunction } from "./remotion-bundler";
import { createMediaSourceServer } from "./media-source-server";

export type RenderResult = {
  outputPath: string;
  // 中文注释：适配器只要求返回输出路径，类型用于 HTTP 响应时可以补充媒体类型。
  contentType?: "video/mp4";
};

export type RenderAdapter = (
  project: EditProject,
  outputPath: string,
  options: {
    cancelSignal: () => boolean;
    mediaSources?: MediaSources;
    serveUrl?: string;
    bundle?: RemotionBundleFunction;
    timeoutInMilliseconds?: number;
  },
) => Promise<RenderResult>;

export const renderProject: RenderAdapter = async (project, outputPath, options) => {
  const serveUrl = options.serveUrl ?? process.env.REMOTION_SERVE_URL ?? await getRemotionServeUrl(options.bundle);

  const mediaSources = options.mediaSources ?? {};
  const mediaServer = await createMediaSourceServer(mediaSources);
  try {
    getCompositionMediaSources(project, mediaServer.mediaSources);
    const inputProps = { project, mediaSources: mediaServer.mediaSources };
    const composition = await selectComposition({
      id: "Editor",
      inputProps,
      timeoutInMilliseconds: options.timeoutInMilliseconds,
      serveUrl,
    });

    await renderMedia({
      cancelSignal: options.cancelSignal,
      codec: "h264",
      composition: {
        ...composition,
        durationInFrames: getCompositionDurationInFrames(project),
        // 中文注释：注册组合只提供默认值，实际导出规格必须跟随编辑项目，才能与浏览器预览一致。
        fps: project.settings.fps,
        height: project.settings.height,
        width: project.settings.width,
      },
      inputProps,
      outputLocation: outputPath,
      overwrite: true,
      serveUrl,
      timeoutInMilliseconds: options.timeoutInMilliseconds,
    });
  } finally {
    // 中文注释：无论 Remotion 成功还是失败，都关闭临时媒体服务，避免本地端口和文件句柄泄漏。
    await mediaServer.close();
  }

  return { outputPath, contentType: "video/mp4" };
};
