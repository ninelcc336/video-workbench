import { bundle } from "@remotion/bundler";
import { resolve } from "node:path";

export type RemotionBundleFunction = (options: { entryPoint: string }) => Promise<string>;

let cachedBundle: Promise<string> | null = null;

/** 中文注释：本地渲染第一次运行时自动打包共享入口，后续任务复用结果避免重复启动 Webpack。 */
export function getRemotionServeUrl(
  bundleFunction: RemotionBundleFunction = bundle,
): Promise<string> {
  if (!cachedBundle) {
    cachedBundle = bundleFunction({
      entryPoint: resolve(process.cwd(), "src/remotion/entry.tsx"),
    }).catch((error) => {
      cachedBundle = null;
      const message = error instanceof Error ? error.message : "未知打包错误";
      throw new Error(`Remotion 自动打包失败：${message}`);
    });
  }
  return cachedBundle;
}

/** 中文注释：测试和开发热重载可以清除缓存，生产渲染过程不需要手动调用。 */
export function resetRemotionBundle(): void {
  cachedBundle = null;
}
