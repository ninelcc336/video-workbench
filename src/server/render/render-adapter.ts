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
  sizeBytes?: number;
  createdAt?: string;
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
  // 中文注释：导出对话框允许选择规格，渲染时把规格映射到同一份项目快照的 settings，保证模板按导出画布计算。
  const exportProject: EditProject = {
    ...project,
    settings: {
      ...project.settings,
      width: project.export.width,
      height: project.export.height,
      fps: project.export.fps,
    },
  };
  const serveUrl = options.serveUrl ?? process.env.REMOTION_SERVE_URL ?? await getRemotionServeUrl(options.bundle);

  const mediaSources = options.mediaSources ?? {};
  const mediaServer = await createMediaSourceServer(mediaSources);
  try {
    getCompositionMediaSources(exportProject, mediaServer.mediaSources);
    const inputProps = { project: exportProject, mediaSources: mediaServer.mediaSources };
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
        durationInFrames: getCompositionDurationInFrames(exportProject),
        // 中文注释：注册组合只提供默认值，实际导出规格必须跟随编辑项目，才能与浏览器预览一致。
        fps: exportProject.settings.fps,
        height: exportProject.settings.height,
        width: exportProject.settings.width,
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
