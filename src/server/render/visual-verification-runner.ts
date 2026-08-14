import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { openBrowser, type HeadlessBrowser } from "@remotion/renderer";
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
  comparePngBuffers,
  DEFAULT_PNG_COMPARISON_OPTIONS,
  type PngComparisonResult,
} from "./visual-image-comparison";
import {
  renderEffectFrameBuffer,
  selectEffectFrameComposition,
} from "./effect-visual-renderer";
import {
  verifyOrUpdateVisualBaselineBuffer,
  type VisualBaselineResult,
} from "./visual-verification-artifacts";
import {
  cleanupStaleRemotionBundleSessions,
  cleanupStaleRemotionChromiumProfiles,
  cleanupNewRemotionChromiumProfiles,
  createRemotionBundleSession,
  snapshotRemotionChromiumProfiles,
  type RemotionBundleFunction,
  type RemotionBundleSession,
} from "./remotion-bundler";
import {
  computeVisualVerificationSourceFingerprint,
  createVisualVerificationCaseFingerprint,
  DEFAULT_VISUAL_VERIFICATION_CACHE_FILE,
  getVisualVerificationBaselineSignature,
  loadVisualVerificationCache,
  saveVisualVerificationCache,
  type VisualVerificationCache,
} from "./visual-verification-cache";

export const DEFAULT_VISUAL_BASELINE_DIRECTORY = resolve(
  process.cwd(),
  "tests/visual-baselines/effect-families",
);
export const DEFAULT_VISUAL_ARTIFACT_DIRECTORY = resolve(
  process.cwd(),
  "test-results/effect-visual-verification",
);
export { DEFAULT_VISUAL_VERIFICATION_CACHE_FILE } from "./visual-verification-cache";

export type VisualArtifactRetention = "failed" | "default" | "all";

export type VisualVerificationRunOptions = VisualVerificationMatrixOptions & {
  update?: boolean;
  baselineDirectory?: string;
  artifactDirectory?: string;
  baseUrl?: string;
  serveUrl?: string;
  bundle?: RemotionBundleFunction;
  timeoutInMilliseconds?: number;
  /** 中文注释：只跳过缓存读取并重新执行真实验证，成功案例仍会刷新缓存供后续日常运行复用。 */
  noCache?: boolean;
  /** 中文注释：测试可注入独立缓存文件；普通命令默认使用 test-results/.cache。 */
  cacheFile?: string;
  /** 中文注释：failed 只保留失败证据，default 额外保留默认固定帧，all 才保留完整案例 PNG。 */
  retainArtifacts?: VisualArtifactRetention;
  /** 中文注释：收到中断信号后停止接收新案例，当前案例结束后仍执行完整资源清理。 */
  signal?: AbortSignal;
};

export type VisualVerificationCaseResult = {
  case: VisualVerificationCase;
  status: "passed" | "missing" | "failed" | "updated" | "error";
  cached?: boolean;
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
  cached: number;
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
): Promise<Buffer> {
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
  return page.locator('[data-effect-frame="true"]').screenshot();
}

/** 中文注释：删除上次运行留下的已知视觉产物，避免保留策略只影响本次而让旧 PNG 无限累积。 */
async function resetVisualArtifactDirectory(artifactDirectory: string): Promise<void> {
  await Promise.all([
    rm(join(artifactDirectory, "remotion"), { force: true, recursive: true }),
    rm(join(artifactDirectory, "browser"), { force: true, recursive: true }),
    rm(join(artifactDirectory, "diff"), { force: true, recursive: true }),
    rm(join(artifactDirectory, "manifest.json"), { force: true }),
  ]);
  await mkdir(artifactDirectory, { recursive: true });
}

/** 中文注释：只在保留策略命中或案例失败时写 PNG，成功参数案例默认只留内存比较结果。 */
async function writeCaseArtifacts(
  paths: ReturnType<typeof getCasePaths>,
  remotionBuffer: Buffer,
  browserBuffer: Buffer,
  writeDiff: Buffer | undefined,
): Promise<void> {
  await Promise.all([
    mkdir(dirname(paths.remotionPath), { recursive: true }).then(() => writeFile(paths.remotionPath, remotionBuffer)),
    mkdir(dirname(paths.browserPath), { recursive: true }).then(() => writeFile(paths.browserPath, browserBuffer)),
    writeDiff
      ? mkdir(dirname(paths.diffPath), { recursive: true }).then(() => writeFile(paths.diffPath, writeDiff))
      : Promise.resolve(),
  ]);
}

/** 中文注释：并行等待所有关闭动作，避免单个 close 失败阻断后续 bundle 和服务清理。 */
async function cleanupVisualVerificationResources(resources: {
  page?: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;
  browser?: Awaited<ReturnType<typeof chromium.launch>>;
  remotionBrowser?: HeadlessBrowser;
  remotionChromiumProfilesBefore?: ReadonlySet<string>;
  bundleSession?: RemotionBundleSession;
  temporaryServer?: Awaited<ReturnType<typeof startVisualVerificationServer>>;
}): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (resources.page) tasks.push(resources.page.close());
  if (resources.browser) tasks.push(resources.browser.close());
  if (resources.remotionBrowser || resources.remotionChromiumProfilesBefore) {
    tasks.push((async () => {
      try {
        await resources.remotionBrowser?.close({ silent: true });
      } finally {
        if (resources.remotionChromiumProfilesBefore) {
          await cleanupNewRemotionChromiumProfiles(resources.remotionChromiumProfilesBefore);
        }
      }
    })());
  }
  if (resources.bundleSession) tasks.push(resources.bundleSession.cleanup());
  if (resources.temporaryServer) tasks.push(resources.temporaryServer.server.close());
  const cleanupResults = await Promise.allSettled(tasks);
  const failure = cleanupResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** 中文注释：只在案例边界检查中断状态，让 Ctrl+C 走 finally，而不是留下半关闭的浏览器和 bundle。 */
function throwIfVerificationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("视觉验证已取消");
}

/**
 * 中文注释：顺序运行未命中的案例以限制峰值负载，并把浏览器、bundle 和缓存都绑定到整次运行生命周期。
 * 默认只保留失败证据；只有源码、输入或基线变化时才重新执行对应案例，完整门禁仍可用 --no-cache 强制运行。
 */
export async function runVisualVerification(
  options: VisualVerificationRunOptions = {},
): Promise<VisualVerificationReport> {
  const matrix = buildVisualVerificationMatrix(options);
  const baselineDirectory = options.baselineDirectory ?? DEFAULT_VISUAL_BASELINE_DIRECTORY;
  const artifactDirectory = options.artifactDirectory ?? DEFAULT_VISUAL_ARTIFACT_DIRECTORY;
  const results: VisualVerificationCaseResult[] = [];
  const retainArtifacts = options.retainArtifacts ?? "failed";
  const cacheEligible = options.update !== true
    && retainArtifacts === "failed"
    && !options.baseUrl
    && !options.serveUrl
    && !process.env.REMOTION_SERVE_URL;
  const cacheReadEnabled = cacheEligible && options.noCache !== true;
  const cacheFile = resolve(options.cacheFile ?? DEFAULT_VISUAL_VERIFICATION_CACHE_FILE);
  let cacheSourceFingerprint: string | undefined;
  let visualCache: VisualVerificationCache | undefined;
  let cachedCount = 0;
  let temporaryServer: Awaited<ReturnType<typeof startVisualVerificationServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>> | undefined;
  let remotionBrowser: HeadlessBrowser | undefined;
  let remotionChromiumProfilesBefore: ReadonlySet<string> | undefined;
  let bundleSession: RemotionBundleSession | undefined;
  let baseUrl = options.baseUrl;
  let serveUrl = options.serveUrl ?? process.env.REMOTION_SERVE_URL;
  let resourcesStarted = false;

  /** 中文注释：只有遇到第一个未命中案例才启动服务和两个浏览器，整目录全命中时无需创建任何渲染进程。 */
  const ensureRenderingResources = async (): Promise<{ baseUrl: string; serveUrl: string }> => {
    if (!baseUrl) {
      temporaryServer = await startVisualVerificationServer();
      baseUrl = temporaryServer.baseUrl;
    }
    if (!serveUrl) {
      bundleSession = await createRemotionBundleSession(options.bundle);
      serveUrl = bundleSession.serveUrl;
    }
    if (!browser) {
      browser = await chromium.launch({
        args: [...VISUAL_VERIFICATION_CHROMIUM_ARGS],
        headless: true,
      });
      page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: { width: 1920, height: 1080 },
      });
    }
    if (!resourcesStarted) {
      remotionChromiumProfilesBefore = await snapshotRemotionChromiumProfiles();
      remotionBrowser = await openBrowser("chrome", { logLevel: "error" });
      resourcesStarted = true;
    }
    return { baseUrl, serveUrl };
  };

  try {
    await resetVisualArtifactDirectory(artifactDirectory);
    await cleanupStaleRemotionBundleSessions();
    await cleanupStaleRemotionChromiumProfiles();

    if (cacheEligible) {
      cacheSourceFingerprint = await computeVisualVerificationSourceFingerprint();
      visualCache = await loadVisualVerificationCache(cacheFile, cacheSourceFingerprint);
    }

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
        scenarioMode: options.scenarioMode ?? "full",
        retainArtifacts,
        cache: {
          enabled: cacheEligible,
          readEnabled: cacheReadEnabled,
          file: cacheFile,
          sourceFingerprint: cacheSourceFingerprint ?? null,
        },
      }, null, 2),
    );

    for (const item of matrix) {
      throwIfVerificationAborted(options.signal);
      const paths = getCasePaths(item, baselineDirectory, artifactDirectory);
      const identity = formatVisualVerificationCase(item);
      const baselinePath = item.scenario === "default" ? paths.baselinePath : undefined;
      const caseFingerprint = cacheEligible
        ? createVisualVerificationCaseFingerprint(item, baselinePath)
        : undefined;
      const cachedEntry = visualCache?.entries[item.id];
      if (cacheReadEnabled && visualCache && caseFingerprint && cachedEntry?.caseFingerprint === caseFingerprint) {
        const baselineSignature = baselinePath
          ? await getVisualVerificationBaselineSignature(baselinePath)
          : null;
        if (baselineSignature === cachedEntry.baselineSignature) {
          cachedCount += 1;
          results.push({
            case: item,
            status: "passed",
            cached: true,
            message: `${identity}：缓存命中，跳过浏览器与 Remotion 渲染`,
            baselinePath,
            baselineComparison: baselinePath
              ? { status: "passed", message: `视觉验证缓存命中：${baselinePath}` }
              : undefined,
          });
          continue;
        }
      }

      if (visualCache) delete visualCache.entries[item.id];
      try {
        const resources = await ensureRenderingResources();
        // 中文注释：组合 props 会随案例变化，必须逐案例解析；浏览器和 bundle 仍在整次运行内复用。
        const composition = await selectEffectFrameComposition(item.renderProps, {
          puppeteerInstance: remotionBrowser,
          serveUrl: resources.serveUrl,
          timeoutInMilliseconds: options.timeoutInMilliseconds,
        });
        const remotionBuffer = await renderEffectFrameBuffer(item.renderProps, {
          composition,
          puppeteerInstance: remotionBrowser,
          serveUrl: resources.serveUrl,
          timeoutInMilliseconds: options.timeoutInMilliseconds,
        });
        const browserBuffer = await captureBrowserFrame(page!, resources.baseUrl, item);

        const engineComparison = comparePngBuffers(remotionBuffer, browserBuffer);
        if (!engineComparison.matches) {
          await writeCaseArtifacts(paths, remotionBuffer, browserBuffer, engineComparison.diffPng);
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
          if (retainArtifacts === "all") {
            await writeCaseArtifacts(paths, remotionBuffer, browserBuffer, undefined);
          }
          if (visualCache && caseFingerprint) {
            visualCache.entries[item.id] = {
              caseFingerprint,
              baselineSignature: null,
              verifiedAt: new Date().toISOString(),
            };
          }
          results.push({
            case: item,
            status: "passed",
            message: `${identity}：参数矩阵通过（浏览器与 Remotion 一致）`,
            remotionPath: retainArtifacts === "all" ? paths.remotionPath : undefined,
            browserPath: retainArtifacts === "all" ? paths.browserPath : undefined,
            engineComparison,
          });
          continue;
        }

        const baselineComparison = await verifyOrUpdateVisualBaselineBuffer({
          actualBuffer: remotionBuffer,
          baselinePath: paths.baselinePath,
          diffPath: paths.diffPath,
          update: options.update === true,
        });
        const keepDefaultArtifacts = retainArtifacts === "all"
          || retainArtifacts === "default"
          || baselineComparison.status !== "passed";
        if (keepDefaultArtifacts) {
          await writeCaseArtifacts(paths, remotionBuffer, browserBuffer, undefined);
        }
        if (visualCache && caseFingerprint && baselineComparison.status === "passed") {
          const baselineSignature = await getVisualVerificationBaselineSignature(paths.baselinePath);
          if (baselineSignature !== null) {
            visualCache.entries[item.id] = {
              caseFingerprint,
              baselineSignature,
              verifiedAt: new Date().toISOString(),
            };
          }
        }
        results.push({
          case: item,
          status: baselineComparison.status,
          message: `${identity}：${baselineComparison.message}`,
          remotionPath: keepDefaultArtifacts ? paths.remotionPath : undefined,
          browserPath: keepDefaultArtifacts ? paths.browserPath : undefined,
          baselinePath: paths.baselinePath,
          diffPath: baselineComparison.comparison?.diffPng ? paths.diffPath : undefined,
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
    if (visualCache && cacheSourceFingerprint) {
      try {
        await saveVisualVerificationCache(cacheFile, visualCache);
      } catch {
        // 中文注释：缓存是可丢弃的性能优化，磁盘权限或中断不应掩盖真实视觉验证结果。
      }
    }
    await cleanupVisualVerificationResources({
      page,
      browser,
      remotionBrowser,
      remotionChromiumProfilesBefore,
      bundleSession,
      temporaryServer,
    });
  }

  return {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    cached: cachedCount,
    updated: results.filter((result) => result.status === "updated").length,
    missing: results.filter((result) => result.status === "missing").length,
    failed: results.filter((result) => result.status === "failed").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}
