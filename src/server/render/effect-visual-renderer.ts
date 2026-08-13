import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { renderStill, selectComposition, type HeadlessBrowser } from "@remotion/renderer";
import type { VideoConfig } from "remotion/no-react";
import type { EffectFamilyRenderProps } from "../../domain/templates/types";
import { getRemotionServeUrl, type RemotionBundleFunction } from "./remotion-bundler";

export type EffectVisualRendererOptions = {
  serveUrl?: string;
  bundle?: RemotionBundleFunction;
  timeoutInMilliseconds?: number;
  puppeteerInstance?: HeadlessBrowser;
  composition?: VideoConfig;
};

/** 中文注释：解析固定帧组合元数据；视觉验证会在一次运行内缓存结果，避免重复打开 Remotion 页面。 */
export async function selectEffectFrameComposition(
  renderProps: EffectFamilyRenderProps,
  options: EffectVisualRendererOptions = {},
): Promise<VideoConfig> {
  const serveUrl = options.serveUrl
    ?? process.env.REMOTION_SERVE_URL
    ?? await getRemotionServeUrl(options.bundle);
  return selectComposition({
    id: "EffectFrame",
    inputProps: { renderProps },
    puppeteerInstance: options.puppeteerInstance,
    serveUrl,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
  });
}

/** 中文注释：统一执行单帧渲染，允许调用方复用浏览器与组合元数据，并可选择将结果直接留在内存。 */
async function renderEffectFrameInternal(
  renderProps: EffectFamilyRenderProps,
  output: string | null,
  options: EffectVisualRendererOptions = {},
): Promise<{ buffer: Buffer | null }> {
  const serveUrl = options.serveUrl
    ?? process.env.REMOTION_SERVE_URL
    ?? await getRemotionServeUrl(options.bundle);
  const inputProps = { renderProps };
  const composition = options.composition
    ?? await selectEffectFrameComposition(renderProps, options);

  if (output) await mkdir(dirname(output), { recursive: true });
  return renderStill({
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
    output,
    overwrite: true,
    puppeteerInstance: options.puppeteerInstance,
    serveUrl,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
  });
}

/** 中文注释：以共享 EffectFrame 组合渲染单张 PNG，浏览器预览和离线固定帧使用同一份输入 props。 */
export async function renderEffectFrame(
  renderProps: EffectFamilyRenderProps,
  outputPath: string,
  options: EffectVisualRendererOptions = {},
): Promise<void> {
  await renderEffectFrameInternal(renderProps, outputPath, options);
}

/** 中文注释：参数矩阵优先在内存中比较，只有失败或明确保留的案例才写入 PNG，减少磁盘 I/O。 */
export async function renderEffectFrameBuffer(
  renderProps: EffectFamilyRenderProps,
  options: EffectVisualRendererOptions = {},
): Promise<Buffer> {
  const result = await renderEffectFrameInternal(renderProps, null, options);
  if (!result.buffer) throw new Error("Remotion 固定帧未返回 PNG 缓冲区");
  return result.buffer;
}
