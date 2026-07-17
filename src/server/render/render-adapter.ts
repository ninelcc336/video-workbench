import { renderMedia, selectComposition } from "@remotion/renderer";
import type { EditProject } from "../../domain/project/model";
import { getCompositionDurationInFrames } from "../../remotion/EditorComposition";
import { getCompositionMediaSources } from "../../remotion/EditorComposition";
import type { MediaSources } from "../../remotion/media";

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
  },
) => Promise<RenderResult>;

export const renderProject: RenderAdapter = async (project, outputPath, options) => {
  const serveUrl = options.serveUrl ?? process.env.REMOTION_SERVE_URL;

  if (!serveUrl) {
    throw new Error("未配置 Remotion 服务地址，无法开始视频渲染");
  }

  const mediaSources = options.mediaSources ?? {};
  getCompositionMediaSources(project, mediaSources);
  const inputProps = { project, mediaSources };
  const composition = await selectComposition({
    id: "Editor",
    inputProps,
    serveUrl,
  });

  await renderMedia({
    cancelSignal: options.cancelSignal,
    codec: "h264",
    composition: {
      ...composition,
      durationInFrames: getCompositionDurationInFrames(project),
    },
    inputProps,
    outputLocation: outputPath,
    overwrite: true,
    serveUrl,
  });

  return { outputPath, contentType: "video/mp4" };
};
