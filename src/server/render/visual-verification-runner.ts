import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { listBuiltInAssets } from "../../domain/assets/built-in-assets";
import {
  buildVisualVerificationMatrix,
  VISUAL_VERIFICATION_CHROMIUM_ARGS,
  VISUAL_VERIFICATION_FONT_FAMILY,
  VISUAL_VERIFICATION_RANDOM_SEED,
  VISUAL_VERIFICATION_VIEWPORTS,
  type VisualVerificationCase,
  type VisualVerificationMatrixOptions,
  type VisualVerificationScope,
} from "../../domain/templates/visual-verification";
import {
  comparePngFiles,
  DEFAULT_PNG_COMPARISON_OPTIONS,
  type PngComparisonResult,
} from "./visual-image-comparison";
import { renderEffectFrame } from "./effect-visual-renderer";
import {
  verifyOrUpdateVisualBaseline,
  type VisualBaselineResult,
} from "./visual-verification-artifacts";
import type { RemotionBundleFunction } from "./remotion-bundler";

export const DEFAULT_VISUAL_BASELINE_DIRECTORY = resolve(
  process.cwd(),
  "tests/visual-baselines/effect-families",
);
export const DEFAULT_VISUAL_ARTIFACT_DIRECTORY = resolve(
  process.cwd(),
  "test-results/effect-visual-verification",
);

export type VisualVerificationRunOptions = VisualVerificationMatrixOptions & {
  update?: boolean;
  baselineDirectory?: string;
  artifactDirectory?: string;
  baseUrl?: string;
  serveUrl?: string;
  bundle?: RemotionBundleFunction;
  timeoutInMilliseconds?: number;
};

export type VisualVerificationCaseResult = {
  case: VisualVerificationCase;
  status: "passed" | "missing" | "failed" | "updated" | "error";
  message: string;
  remotionPath?: string;
  browserPath?: string;
  baselinePath?: string;
  diffPath?: string;
  engineComparison?: PngComparisonResult;
  baselineComparison?: VisualBaselineResult;
};

export type VisualVerificationReport = {
  total: number;
  passed: number;
  updated: number;
  missing: number;
  failed: number;
  errors: number;
  results: VisualVerificationCaseResult[];
};

/** 中文注释：把一个案例的完整身份压进失败信息，便于从全目录输出直接定位重现输入。 */
export function formatVisualVerificationCase(item: VisualVerificationCase): string {
  const parameter = item.parameterKey ? `，参数=${item.parameterKey}` : "";
  return `族=${item.familyName}(${item.familyId}@v${item.familyVersion})，样式=${item.startingStyleName}(${item.startingStyleId})，画幅=${item.aspectRatio}，帧=${item.frameStage}/${item.frame}，场景=${item.scenario}${parameter}`;
}

/** 中文注释：路径片段只保留可移植字符，案例 ID 的斜杠由目录层级单独处理。 */
function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
}

/** 中文注释：所有产物使用同一案例路径，人工查看时可以从族、样式、画幅和帧反向找到输入。 */
function getCasePaths(
  item: VisualVerificationCase,
  baselineDirectory: string,
  artifactDirectory: string,
): { remotionPath: string; browserPath: string; baselinePath: string; diffPath: string } {
  const segments = item.id.split("/").map(safePathSegment);
  const fileName = `${segments.pop() ?? "case"}.png`;
  const directory = join(...segments);
  return {
    remotionPath: join(artifactDirectory, "remotion", directory, fileName),
    browserPath: join(artifactDirectory, "browser", directory, fileName),
    baselinePath: join(baselineDirectory, directory, fileName),
    diffPath: join(artifactDirectory, "diff", directory, fileName),
  };
}

/** 中文注释：启动临时 Vite 服务提供独立验证页，命令结束后由调用方关闭以释放端口。 */
async function startVisualVerificationServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({
    configFile: resolve(process.cwd(), "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("视觉验证无法取得 Vite 服务地址");
  }
  // 中文注释：服务明确绑定回环 IPv4 时也使用同一地址，避免 localhost 解析到其他本地监听器。
  return { server, baseUrl: `http://127.0.0.1:${address.port}/` };
}

/** 中文注释：等待字体和验证根节点稳定后截图，避免截图发生在 React 尚未挂载或字体尚未加载的瞬间。 */
async function captureBrowserFrame(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  baseUrl: string,
  item: VisualVerificationCase,
  outputPath: string,
): Promise<void> {
  const url = new URL("visual-verification.html", baseUrl);
  url.searchParams.set("renderProps", JSON.stringify(item.renderProps));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.locator('[data-visual-verification-ready="true"]').waitFor();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  const missingImages = await page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLImageElement>("img[data-asset-id]"),
  )
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.dataset.assetId ?? "unknown"));
  if (missingImages.length > 0) {
    throw new Error(`视觉验证内置图标未加载：${missingImages.join(", ")}`);
  }
  const fontAssetUrls = await page.evaluate(() => [...new Set(
    Array.from(document.querySelectorAll<HTMLElement>("[data-font-asset-url]"))
      .map((element) => element.dataset.fontAssetUrl)
      .filter((url): url is string => Boolean(url)),
  )]);
  const missingFonts = await page.evaluate(async (urls) => {
    const results = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url);
      return response.ok ? undefined : url;
    }));
    return results.filter((url): url is string => Boolean(url));
  }, fontAssetUrls);
  if (missingFonts.length > 0) {
    throw new Error(`视觉验证内置字体未加载：${missingFonts.join(", ")}`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await page.locator('[data-effect-frame="true"]').screenshot({ path: outputPath });
}

/** 中文注释：顺序运行案例以限制 Chromium 和 Remotion 的峰值负载，并让失败输出稳定可复现。 */
export async function runVisualVerification(
  options: VisualVerificationRunOptions = {},
): Promise<VisualVerificationReport> {
  const matrix = buildVisualVerificationMatrix(options);
  const baselineDirectory = options.baselineDirectory ?? DEFAULT_VISUAL_BASELINE_DIRECTORY;
  const artifactDirectory = options.artifactDirectory ?? DEFAULT_VISUAL_ARTIFACT_DIRECTORY;
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    join(artifactDirectory, "manifest.json"),
    JSON.stringify({
      comparison: DEFAULT_PNG_COMPARISON_OPTIONS,
      fonts: listBuiltInAssets("font").map((asset) => asset.id),
      fontFamily: VISUAL_VERIFICATION_FONT_FAMILY,
      chromiumArgs: [...VISUAL_VERIFICATION_CHROMIUM_ARGS],
      randomSeed: options.randomSeed ?? VISUAL_VERIFICATION_RANDOM_SEED,
      viewports: VISUAL_VERIFICATION_VIEWPORTS,
      browser: { deviceScaleFactor: 1, viewport: { width: 1920, height: 1080 } },
    }, null, 2),
  );
  const temporaryServer = options.baseUrl ? undefined : await startVisualVerificationServer();
  const baseUrl = options.baseUrl ?? temporaryServer?.baseUrl;
  if (!baseUrl) throw new Error("视觉验证缺少浏览器服务地址");

  const browser = await chromium.launch({
    args: [...VISUAL_VERIFICATION_CHROMIUM_ARGS],
    headless: true,
  });
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1920, height: 1080 },
  });
  const results: VisualVerificationCaseResult[] = [];

  try {
    for (const item of matrix) {
      const paths = getCasePaths(item, baselineDirectory, artifactDirectory);
      const identity = formatVisualVerificationCase(item);
      try {
        await renderEffectFrame(item.renderProps, paths.remotionPath, {
          bundle: options.bundle,
          serveUrl: options.serveUrl,
          timeoutInMilliseconds: options.timeoutInMilliseconds,
        });
        await captureBrowserFrame(page, baseUrl, item, paths.browserPath);

        const engineComparison = await comparePngFiles(paths.remotionPath, paths.browserPath);
        if (!engineComparison.matches) {
          if (engineComparison.diffPng) {
            await mkdir(dirname(paths.diffPath), { recursive: true });
            await writeFile(paths.diffPath, engineComparison.diffPng);
          }
          results.push({
            case: item,
            status: "failed",
            message: `${identity}：浏览器过程预览与 Remotion 固定帧不一致，差异像素=${engineComparison.differingPixels}`,
            remotionPath: paths.remotionPath,
            browserPath: paths.browserPath,
            diffPath: paths.diffPath,
            engineComparison,
          });
          continue;
        }

        if (item.scenario !== "default") {
          // 中文注释：极端参数属于行为矩阵，只需确认两端观察结果一致；默认场景才写入版本化固定帧基线。
          results.push({
            case: item,
            status: "passed",
            message: `${identity}：参数矩阵通过（浏览器与 Remotion 一致）`,
            remotionPath: paths.remotionPath,
            browserPath: paths.browserPath,
            diffPath: paths.diffPath,
            engineComparison,
          });
          continue;
        }

        const baselineComparison = await verifyOrUpdateVisualBaseline({
          actualPath: paths.remotionPath,
          baselinePath: paths.baselinePath,
          diffPath: paths.diffPath,
          update: options.update === true,
        });
        results.push({
          case: item,
          status: baselineComparison.status,
          message: `${identity}：${baselineComparison.message}`,
          remotionPath: paths.remotionPath,
          browserPath: paths.browserPath,
          baselinePath: paths.baselinePath,
          diffPath: paths.diffPath,
          engineComparison,
          baselineComparison,
        });
      } catch (error) {
        results.push({
          case: item,
          status: "error",
          message: `${identity}：${error instanceof Error ? error.message : String(error)}`,
          remotionPath: paths.remotionPath,
          browserPath: paths.browserPath,
          baselinePath: paths.baselinePath,
          diffPath: paths.diffPath,
        });
      }
    }
  } finally {
    await page.close();
    await browser.close();
    await temporaryServer?.server.close();
  }

  return {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    updated: results.filter((result) => result.status === "updated").length,
    missing: results.filter((result) => result.status === "missing").length,
    failed: results.filter((result) => result.status === "failed").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}
