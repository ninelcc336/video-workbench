import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { EffectFamilyRenderProps } from "../../domain/templates/types";
import { getRemotionServeUrl, type RemotionBundleFunction } from "./remotion-bundler";

export type EffectVisualRendererOptions = {
  serveUrl?: string;
  bundle?: RemotionBundleFunction;
  timeoutInMilliseconds?: number;
};

/** 中文注释：以共享 EffectFrame 组合渲染单张 PNG，浏览器预览和离线固定帧使用同一份输入 props。 */
export async function renderEffectFrame(
  renderProps: EffectFamilyRenderProps,
  outputPath: string,
  options: EffectVisualRendererOptions = {},
): Promise<void> {
  const serveUrl = options.serveUrl
    ?? process.env.REMOTION_SERVE_URL
    ?? await getRemotionServeUrl(options.bundle);
  const inputProps = { renderProps };

  await mkdir(dirname(outputPath), { recursive: true });
  const composition = await selectComposition({
    id: "EffectFrame",
    inputProps,
    serveUrl,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
  });

  await renderStill({
    composition: {
      ...composition,
      durationInFrames: renderProps.durationInFrames,
      fps: renderProps.fps,
      height: renderProps.height,
      width: renderProps.width,
    },
    frame: renderProps.frame,
    imageFormat: "png",
    inputProps,
    output: outputPath,
    overwrite: true,
    serveUrl,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
  });
}
