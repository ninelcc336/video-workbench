import {
  runVisualVerification,
  type VisualVerificationRunOptions,
} from "../src/server/render/visual-verification-runner";
import type { VisualVerificationScope } from "../src/domain/templates/visual-verification";

type ParsedArguments = {
  options: VisualVerificationRunOptions;
  help: boolean;
};

/** 中文注释：读取命令行选项并保留未知参数为显式错误，避免验证范围被拼写错误悄悄放大。 */
function parseArguments(argv: string[]): ParsedArguments {
  const values = new Map<string, string | true>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    if (key === "help" || key === "update" || key === "square-stages" || key === "quick" || key === "no-cache") {
      values.set(key, true);
      continue;
    }
    const nextValue = inlineValue ?? argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`命令行选项缺少值：--${key}`);
    }
    if (!["family", "family-id", "style", "starting-style", "version", "baseline-dir", "artifact-dir", "base-url", "serve-url", "retain-artifacts"].includes(key)) {
      throw new Error(`未知视觉验证选项：--${key}`);
    }
    values.set(key, nextValue);
    if (inlineValue === undefined) index += 1;
  }

  const familyId = String(values.get("family") ?? values.get("family-id") ?? "");
  const startingStyleId = String(values.get("style") ?? values.get("starting-style") ?? "");
  const versionText = values.get("version");
  const version = versionText === undefined ? undefined : Number(versionText);
  if (versionText !== undefined && (!Number.isInteger(version) || version <= 0)) {
    throw new Error(`特效族版本必须是正整数：${versionText}`);
  }

  const mode = positional[0];
  if (positional.length > 1 || (mode !== undefined && !["catalog", "family", "style"].includes(mode))) {
    throw new Error("运行范围必须是 catalog、family 或 style");
  }
  if ((mode === "family" || mode === "style" || familyId) && !familyId) {
    throw new Error("单族或单样式验证必须提供 --family");
  }
  if (mode === "style" && !startingStyleId) {
    throw new Error("单样式验证必须提供 --style");
  }
  if (startingStyleId && !familyId) {
    throw new Error("--style 必须和 --family 一起使用");
  }

  const retainArtifacts = values.get("retain-artifacts");
  if (retainArtifacts !== undefined && !["failed", "default", "all"].includes(String(retainArtifacts))) {
    throw new Error(`视觉产物保留策略无效：${String(retainArtifacts)}，可选 failed、default、all`);
  }

  let scope: VisualVerificationScope = { kind: "catalog" };
  if (familyId) {
    scope = startingStyleId
      ? { kind: "style", familyId, startingStyleId, version }
      : { kind: "family", familyId, version };
  } else if (mode === "style" || mode === "family") {
    throw new Error("运行范围缺少特效族参数");
  }

  return {
    help: values.has("help"),
    options: {
      scope,
      update: values.has("update"),
      baselineDirectory: values.get("baseline-dir") as string | undefined,
      artifactDirectory: values.get("artifact-dir") as string | undefined,
      baseUrl: values.get("base-url") as string | undefined,
      serveUrl: values.get("serve-url") as string | undefined,
      noCache: values.has("no-cache"),
      retainArtifacts: (retainArtifacts ?? "failed") as "failed" | "default" | "all",
      scenarioMode: values.has("quick") ? "quick" : "full",
      includeSquareFrameStages: values.has("square-stages"),
    },
  };
}

/** 中文注释：帮助文本明确说明日常测试不会自动执行完整视觉矩阵，基线更新必须显式确认。 */
function printHelp(): void {
  console.log(`用法：
  npm run test:visual
  npm run test:visual -- --family checklist-steps
  npm run test:visual -- --family checklist-steps --style information-list
  npm run test:visual:quick -- --family checklist-steps
  npm run test:visual -- --update

选项：
  catalog                     验证全目录（默认）
  --family <id>               限定一个特效族
  --style <id>                限定一个起始样式，必须同时提供 --family
  --version <number>          指定特效族版本
  --update                    新增或更新视觉基线
  --baseline-dir <path>      覆盖基线目录
  --artifact-dir <path>      覆盖截图和差异图目录
  --base-url <url>            使用已运行的浏览器验证页面服务
  --serve-url <url>           使用已打包的 Remotion 服务
  --quick                     只验证默认固定帧，不展开参数边界矩阵
  --retain-artifacts <mode>   产物保留：failed、default 或 all（默认 failed）
  --no-cache                  跳过已通过案例缓存，重新执行真实验证并刷新缓存
  --square-stages              为 1:1 画布额外验证入场和出场固定帧
  --help                      显示本帮助
`);
}

/** 中文注释：命令入口只负责参数、汇总和退出码，渲染与比较行为集中在 runner 以便复用和测试。 */
async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    const report = await runVisualVerification({ ...parsed.options, signal: abortController.signal });
    for (const result of report.results.filter((item) => item.status !== "passed")) {
      console.log(`[${result.status}] ${result.message}`);
    }
    console.log(`视觉验证完成：总计 ${report.total}，通过 ${report.passed}，缓存命中 ${report.cached}，更新 ${report.updated}，缺失 ${report.missing}，失败 ${report.failed}，错误 ${report.errors}`);
    if (report.missing > 0 || report.failed > 0 || report.errors > 0) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
