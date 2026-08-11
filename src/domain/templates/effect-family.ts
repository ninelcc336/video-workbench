import type {
  AspectRatio,
  EffectFamilyDefinition,
  EffectFamilyMigration,
  EffectFamilyMigrationOutput,
  EffectFamilyRenderProps,
  EffectFamilySummary,
  EffectParameterDefinition,
  ParameterDefinition,
  TemplateDefinition,
  TemplateRenderProps,
  TemplateCategory,
} from "./types";
import {
  compressAnimationStages as compressStageValue,
  type AnimationStageInput,
} from "./animation-stages";
import {
  getDefaultParams,
  normalizeParameterValuesWithDiagnostics,
} from "./parameter-schema";

const effectFamilies = new Map<string, EffectFamilyDefinition>();

function effectFamilyKey(id: string, version: number): string {
  return `${id}@${version}`;
}

/** 中文注释：目录筛选只描述调用方需要的条件，避免模板库依赖注册表的 Map 或渲染函数。 */
export type EffectFamilyQuery = {
  category?: TemplateCategory;
  purposeTag?: string;
  purposeTags?: ReadonlyArray<string>;
  visualDirection?: string;
  visualDirections?: ReadonlyArray<string>;
  text?: string;
  includeLegacy?: boolean;
};

export type EffectFamilyInstance = {
  effectFamilyId: string;
  version: number;
  startingStyleId: string;
  aspectRatio: AspectRatio;
  durationInFrames: number;
  params: Record<string, unknown>;
};

export type EffectFamilyValidationOptions = {
  durationInFrames?: number;
};

export type EffectFamilyIssue = {
  key?: string;
  code: string;
  message: string;
};

export type EffectFamilyValidationResult = {
  valid: boolean;
  params: Record<string, unknown>;
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

export type EffectFamilyParameterChange = {
  key: string;
  previousValue: unknown;
  nextValue: unknown;
};

export type StartingStyleSwitchResult = {
  instance: EffectFamilyInstance;
  changes: EffectFamilyParameterChange[];
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

export type EffectFamilyUpgradeRequest = {
  familyId: string;
  fromVersion: number;
  toVersion?: number;
  params: Record<string, unknown>;
};

export type EffectFamilyUpgradeResult = {
  valid: boolean;
  fromVersion: number;
  toVersion: number;
  params: Record<string, unknown>;
  changes: EffectFamilyParameterChange[];
  droppedKeys: string[];
  defaultedKeys: string[];
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

export type EffectRenderInputRequest = {
  familyId: string;
  version?: number;
  startingStyleId: string;
  aspectRatio: AspectRatio;
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  params: Record<string, unknown>;
  randomSeed?: string;
};

export type EffectRenderInput = {
  family: EffectFamilyDefinition;
  renderProps: EffectFamilyRenderProps;
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

/**
 * 中文注释：注册时校验声明的完整性，把参数默认值和样式元数据错误尽早挡在目录之外，
 * 避免编辑器或 Remotion 运行到一半才发现不可渲染的族。
 */
function assertEffectFamilyDefinition(family: EffectFamilyDefinition): void {
  if (
    !family.id.trim() ||
    !Number.isInteger(family.version) ||
    family.version <= 0 ||
    !family.name.trim() ||
    !family.description.trim() ||
    !Number.isInteger(family.defaultDurationInFrames) ||
    family.defaultDurationInFrames <= 0 ||
    typeof family.render !== "function" ||
    !Array.isArray(family.startingStyles) ||
    family.startingStyles.length === 0
  ) {
    throw new Error(`特效族“${family.id || "未命名"}”声明不完整`);
  }
  if (!family.legacy && (family.purposeTags.length === 0 || family.visualDirections.length === 0)) {
    throw new Error(`特效族“${family.id}”必须声明用途标签和视觉方向`);
  }

  const parameterKeys = new Set<string>();
  for (const parameter of family.parameters) {
    if (
      !parameter.key.trim() ||
      parameterKeys.has(parameter.key) ||
      !parameter.group ||
      !parameter.level ||
      !parameter.styleSwitch
    ) {
      throw new Error(`特效族“${family.id}”包含不完整或重复的参数声明：${parameter.key || "未命名"}`);
    }
    parameterKeys.add(parameter.key);
    const defaultCheck = normalizeParameterValuesWithDiagnostics(
      [parameter],
      { [parameter.key]: parameter.defaultValue },
    );
    if (defaultCheck.errors.length > 0) {
      throw new Error(`特效族“${family.id}”的参数“${parameter.key}”默认值无效`);
    }
  }

  const styleIds = new Set<string>();
  for (const style of family.startingStyles) {
    if (!style.id.trim() || styleIds.has(style.id) || !style.name.trim() || !style.visualDirection.trim()) {
      throw new Error(`特效族“${family.id}”包含不完整或重复的起始样式：${style.id || "未命名"}`);
    }
    styleIds.add(style.id);
    const styleCheck = normalizeParameterValuesWithDiagnostics(family.parameters, style.defaultParams);
    if (styleCheck.errors.length > 0 || styleCheck.warnings.some((warning) => warning.code === "unknown_parameter")) {
      throw new Error(`特效族“${family.id}”的起始样式“${style.id}”默认参数无效`);
    }
    assertAspectRatioDefaults(
      family,
      style.aspectRatioDefaults,
      `起始样式“${style.id}”画幅默认值`,
    );
  }
  assertAspectRatioDefaults(family, family.aspectRatioDefaults, "族级画幅默认值");

  const migrations = new Set<string>();
  for (const migration of family.migrations) {
    const migrationKey = `${migration.fromVersion}->${migration.toVersion}`;
    if (
      !Number.isInteger(migration.fromVersion) ||
      migration.fromVersion <= 0 ||
      !Number.isInteger(migration.toVersion) ||
      migration.toVersion <= 0 ||
      migration.fromVersion === migration.toVersion ||
      migrations.has(migrationKey) ||
      typeof migration.migrate !== "function"
    ) {
      throw new Error(`特效族“${family.id}”包含无效版本迁移：${migrationKey}`);
    }
    migrations.add(migrationKey);
  }
}

/** 中文注释：族级和样式级画幅覆盖使用同一校验规则，确保部分布局不会绕过参数白名单。 */
function assertAspectRatioDefaults(
  family: EffectFamilyDefinition,
  overrides: Partial<Record<AspectRatio, Readonly<Record<string, unknown>>>> | undefined,
  label: string,
): void {
  for (const [aspectRatio, values] of Object.entries(overrides ?? {})) {
    if (!["16:9", "9:16", "1:1"].includes(aspectRatio)) {
      throw new Error(`特效族“${family.id}”的${label}画幅无效：${aspectRatio}`);
    }
    const overrideCheck = normalizeParameterValuesWithDiagnostics(
      family.parameters,
      values as Record<string, unknown>,
    );
    if (overrideCheck.errors.length > 0 || overrideCheck.warnings.some((warning) => warning.code === "unknown_parameter")) {
      throw new Error(`特效族“${family.id}”的${label}无效`);
    }
  }
}

/** 中文注释：按稳定的族 ID 和版本注册声明，重复版本直接失败以防止历史渲染器被覆盖。 */
export function registerEffectFamily(family: EffectFamilyDefinition): void {
  assertEffectFamilyDefinition(family);
  const key = effectFamilyKey(family.id, family.version);
  if (effectFamilies.has(key)) {
    throw new Error(`重复注册特效族：${key}`);
  }
  effectFamilies.set(key, family);
}

/** 中文注释：旧参数没有新版元数据时按内容、布局和表现的保守规则补齐，不改变原参数值。 */
function inferLegacyParameterMetadata(parameter: ParameterDefinition): EffectParameterDefinition {
  if (parameter.group && parameter.level && parameter.styleSwitch) {
    return parameter as EffectParameterDefinition;
  }

  const group = parameter.group ?? (
    parameter.type === "position" || parameter.type === "size" ? "layout" : "appearance"
  );
  const styleSwitch = parameter.styleSwitch ?? (
    group === "content" || parameter.type === "position" || parameter.type === "size"
      ? "preserve"
      : "replace"
  );

  return {
    ...parameter,
    group,
    level: parameter.level ?? "basic",
    styleSwitch,
  } as EffectParameterDefinition;
}

type LegacyCatalogMetadata = Pick<EffectFamilyDefinition, "purposeTags" | "visualDirections">;

const legacyCatalogMetadata: Record<string, LegacyCatalogMetadata> = {
  "section-title-overlay": {
    purposeTags: ["标题", "章节"],
    visualDirections: ["简洁信息", "科技数据"],
  },
  "card-overlay": {
    purposeTags: ["重点标注", "结论"],
    visualDirections: ["简洁信息", "活力社媒"],
  },
  "checklist-overlay": {
    purposeTags: ["清单", "步骤"],
    visualDirections: ["简洁信息", "科技数据"],
  },
  "comment-panel-overlay": {
    purposeTags: ["引用", "评论"],
    visualDirections: ["简洁信息", "活力社媒"],
  },
  "tag-pills-overlay": {
    purposeTags: ["标签", "状态"],
    visualDirections: ["简洁信息", "活力社媒"],
  },
  "bubble-decoration": {
    purposeTags: ["装饰", "节奏"],
    visualDirections: ["科技数据", "活力社媒"],
  },
  "basic-transition": {
    purposeTags: ["画面连接"],
    visualDirections: ["简洁信息"],
  },
};

/** 中文注释：为历史模板补齐目录策划信息；未知旧模板按顶层类型给出中性的表达目的和视觉方向。 */
function getLegacyCatalogMetadata(template: TemplateDefinition): LegacyCatalogMetadata {
  return legacyCatalogMetadata[template.id] ?? (template.category === "decorative-animation"
    ? { purposeTags: ["画面点缀"], visualDirections: ["活力社媒"] }
    : template.category === "transition"
      ? { purposeTags: ["画面连接"], visualDirections: ["简洁信息"] }
      : { purposeTags: ["信息说明"], visualDirections: ["简洁信息"] });
}

/** 中文注释：把旧模板包装成历史特效族适配器，只为统一读取和渲染入口，不把旧模板自动升级为新版族。 */
export function registerLegacyTemplate(template: TemplateDefinition): void {
  const { purposeTags, visualDirections } = getLegacyCatalogMetadata(template);
  registerEffectFamily({
    id: template.id,
    version: template.version,
    category: template.category,
    name: template.name,
    // 中文注释：旧版基础转场仍按 v1 渲染，但在兼容摘要中明确标注为历史全屏过渡遮罩。
    description: template.id === "basic-transition"
      ? `历史全屏过渡遮罩：${template.description}`
      : template.description,
    purposeTags,
    visualDirections,
    defaultDurationInFrames: template.defaultDurationInFrames,
    parameters: template.parameters.map(inferLegacyParameterMetadata),
    startingStyles: [{
      id: "legacy-default",
      name: "旧版默认",
      visualDirection: visualDirections[0],
      defaultParams: getDefaultParams(template.parameters),
    }],
    aspectRatioDefaults: {},
    migrations: [],
    legacy: true,
    render: (props) => template.render({
      frame: props.frame,
      fps: props.fps,
      width: props.width,
      height: props.height,
      durationInFrames: props.durationInFrames,
      params: props.params,
    }),
  });
}

/**
 * 中文注释：旧模板调用方暂时只认识 TemplateDefinition；适配器把新版族的首个起始样式映射为单个可添加条目，
 * 渲染时仍重新通过族接口合并画幅默认值，避免模板库复制一套渲染逻辑。
 */
export function createTemplateDefinitionAdapter(
  family: EffectFamilyDefinition,
  startingStyleId = family.startingStyles[0]?.id,
): TemplateDefinition {
  if (!startingStyleId) {
    throw new Error(`特效族“${family.id}”没有可用的起始样式`);
  }
  const defaultInstance = createEffectFamilyInstance(family, startingStyleId, "16:9");

  return {
    id: family.id,
    version: family.version,
    category: family.category,
    name: family.name,
    description: family.description,
    defaultDurationInFrames: family.defaultDurationInFrames,
    parameters: family.parameters,
    effectFamilyId: family.id,
    startingStyleId,
    defaultParams: defaultInstance.params,
    render: (props: TemplateRenderProps) => {
      const aspectRatio = getAspectRatioForCanvas(props.width, props.height);
      const instance = createEffectFamilyInstance(family, startingStyleId, aspectRatio);
      const input = createEffectRenderInput({
        familyId: family.id,
        version: family.version,
        startingStyleId,
        aspectRatio,
        frame: props.frame,
        fps: props.fps,
        width: props.width,
        height: props.height,
        durationInFrames: props.durationInFrames,
        params: { ...instance.params, ...props.params },
      });
      return family.render(input.renderProps);
    },
  };
}

/** 中文注释：显式版本用于恢复历史片段；省略版本时只取当前已注册的最高版本。 */
export function getEffectFamily(
  familyId: string,
  version?: number,
): EffectFamilyDefinition {
  if (version !== undefined) {
    const family = effectFamilies.get(effectFamilyKey(familyId, version));
    if (family) return family;
  } else {
    const candidates = [...effectFamilies.values()]
      .filter((family) => family.id === familyId)
      .sort((left, right) => right.version - left.version);
    if (candidates[0]) return candidates[0];
  }

  throw new Error(
    version === undefined
      ? `未找到特效族：${familyId}`
      : `未找到特效族：${familyId}@${version}`,
  );
}

/** 中文注释：列表结果剥离参数和渲染函数，供目录安全地展示族级元数据。 */
export function listEffectFamilies(query: EffectFamilyQuery = {}): EffectFamilySummary[] {
  const text = query.text?.trim().toLocaleLowerCase("zh-CN");

  return [...effectFamilies.values()]
    .filter((family) => query.includeLegacy === true || family.legacy !== true)
    .filter((family) => query.category === undefined || family.category === query.category)
    .filter((family) => query.purposeTag === undefined || family.purposeTags.includes(query.purposeTag))
    .filter((family) => query.purposeTags === undefined || query.purposeTags.every((tag) => family.purposeTags.includes(tag)))
    .filter((family) => query.visualDirection === undefined || family.visualDirections.includes(query.visualDirection))
    .filter((family) => query.visualDirections === undefined || query.visualDirections.every((direction) => family.visualDirections.includes(direction)))
    .filter((family) => {
      if (!text) return true;
      return [family.name, family.description, ...family.purposeTags]
        .some((value) => value.toLocaleLowerCase("zh-CN").includes(text));
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map(({ parameters: _parameters, render: _render, migrations: _migrations, startingStyles, ...summary }) => ({
      ...summary,
      startingStyles: startingStyles.map(({ defaultParams: _defaultParams, aspectRatioDefaults: _aspectRatioDefaults, parameterConstraints: _parameterConstraints, ...style }) => style),
    }));
}

/** 中文注释：把任意有效画布映射到最近的首阶段比例，所有渲染调用方使用同一结果避免布局分歧。 */
export function getAspectRatioForCanvas(width: number, height: number): AspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "16:9";
  }

  const ratio = width / height;
  const candidates: Array<{ aspectRatio: AspectRatio; value: number }> = [
    { aspectRatio: "16:9", value: 16 / 9 },
    { aspectRatio: "9:16", value: 9 / 16 },
    { aspectRatio: "1:1", value: 1 },
  ];
  return candidates
    .sort((left, right) => Math.abs(left.value - ratio) - Math.abs(right.value - ratio))[0]
    .aspectRatio;
}

/** 中文注释：统一接受族 ID 或已解析声明，便于测试和未来族模块复用同一组行为。 */
function resolveFamily(family: string | EffectFamilyDefinition): EffectFamilyDefinition {
  return typeof family === "string" ? getEffectFamily(family) : family;
}

/** 中文注释：样式 ID 不存在时直接失败，避免把用户的切换请求静默落到错误外观。 */
function resolveStartingStyle(
  family: EffectFamilyDefinition,
  startingStyleId: string,
): EffectFamilyDefinition["startingStyles"][number] {
  const style = family.startingStyles.find((candidate) => candidate.id === startingStyleId);
  if (!style) {
    throw new Error(`未找到特效族起始样式：${family.id}/${startingStyleId}`);
  }
  return style;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/** 中文注释：参数差异需要结构比较，避免对象键顺序或深拷贝导致无意义的迁移变更。 */
function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]));
}

/** 中文注释：样式切换按实例保存的版本解析族，确保历史片段不会意外使用最新声明。 */
function resolveFamilyVersion(
  family: string | EffectFamilyDefinition,
  version: number,
): EffectFamilyDefinition {
  if (typeof family === "string") return getEffectFamily(family, version);
  return family.version === version ? family : getEffectFamily(family.id, version);
}

/** 中文注释：集中生成目标样式安全默认值，创建实例和切换样式必须共享同一合并优先级。 */
function buildStyleDefaults(
  family: EffectFamilyDefinition,
  style: EffectFamilyDefinition["startingStyles"][number],
  aspectRatio: AspectRatio,
): Record<string, unknown> {
  const defaults = {
    ...getDefaultParams(family.parameters),
    ...cloneValue(style.defaultParams),
    ...cloneValue(family.aspectRatioDefaults[aspectRatio] ?? {}),
    ...cloneValue(style.aspectRatioDefaults?.[aspectRatio] ?? {}),
  };
  return normalizeParameterValuesWithDiagnostics(family.parameters, defaults).values;
}

/** 中文注释：内容始终保留，位置和尺寸默认保留，其余参数服从声明的样式切换策略。 */
function shouldPreserveParameter(
  parameter: EffectFamilyDefinition["parameters"][number],
): boolean {
  if (parameter.group === "content") return true;
  if (
    parameter.group === "layout" &&
    (parameter.type === "position" || parameter.type === "size")
  ) {
    return true;
  }
  return parameter.styleSwitch === "preserve";
}

/** 中文注释：容量限制只产生提醒，不修改用户内容，交由上层在可撤销操作前展示差异。 */
function getContentCapacityWarning(
  key: string,
  value: unknown,
  style: EffectFamilyDefinition["startingStyles"][number],
): EffectFamilyIssue | undefined {
  const constraint = style.parameterConstraints?.[key];
  if (!constraint) return undefined;

  if (Array.isArray(value) && constraint.maxItems !== undefined && value.length > constraint.maxItems) {
    return {
      key,
      code: "content_capacity",
      message: `起始样式“${style.name}”最多容纳 ${constraint.maxItems} 个条目，已保留当前内容供用户确认`,
    };
  }
  if (typeof value === "string" && constraint.maxLength !== undefined && value.length > constraint.maxLength) {
    return {
      key,
      code: "content_capacity",
      message: `起始样式“${style.name}”建议文本不超过 ${constraint.maxLength} 个字符，已保留当前内容供用户确认`,
    };
  }
  return undefined;
}

/** 中文注释：把共享阶段压缩结果转换为特效族诊断，保持错误和警告仍由深模块统一返回。 */
function compressAnimationStages(
  parameters: ReadonlyArray<ParameterDefinition>,
  params: Record<string, unknown>,
  durationInFrames: number | undefined,
): { params: Record<string, unknown>; warnings: EffectFamilyIssue[] } {
  const nextParams = { ...params };
  const warnings: EffectFamilyIssue[] = [];
  for (const parameter of parameters) {
    if (parameter.type !== "animation-stage") continue;
    const stageValue = params[parameter.key];
    if (typeof stageValue !== "object" || stageValue === null || Array.isArray(stageValue)) continue;

    const compression = compressStageValue(
      stageValue as AnimationStageInput,
      durationInFrames,
    );
    if (!compression.compressed) continue;

    nextParams[parameter.key] = compression.stages;
    warnings.push({
      key: parameter.key,
      code: "animation_duration_compressed",
      message: `动画阶段总时长超过 ${durationInFrames ?? "片段"} 帧，已按固定比例压缩`,
    });
  }

  return { params: nextParams, warnings };
}

/** 中文注释：兼容迁移器返回裸参数对象或带差异元数据的结果对象。 */
function isMigrationOutput(value: unknown): value is EffectFamilyMigrationOutput {
  return typeof value === "object" &&
    value !== null &&
    "params" in value &&
    typeof value.params === "object" &&
    value.params !== null &&
    !Array.isArray(value.params);
}

/** 中文注释：迁移按版本图做最短路径搜索，支持多个小版本迁移串联且不自动执行。 */
function findMigrationPath(
  familyId: string,
  fromVersion: number,
  toVersion: number,
): EffectFamilyMigration[] | undefined {
  const versions = [...effectFamilies.values()].filter((family) => family.id === familyId);
  const queue: Array<{ version: number; path: EffectFamilyMigration[] }> = [{ version: fromVersion, path: [] }];
  const visited = new Set<number>([fromVersion]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.version === toVersion) return current.path;

    for (const family of versions) {
      for (const migration of family.migrations) {
        if (migration.fromVersion !== current.version || visited.has(migration.toVersion)) continue;
        visited.add(migration.toVersion);
        queue.push({
          version: migration.toVersion,
          path: [...current.path, migration],
        });
      }
    }
  }

  return undefined;
}

/**
 * 中文注释：创建实例时按“schema 默认值 → 起始样式 → 族级画幅 → 样式级画幅”合并，
 * 让画幅适配集中在特效族模块，同时保证输出只包含声明参数。
 */
export function createEffectFamilyInstance(
  family: string | EffectFamilyDefinition,
  startingStyleId: string,
  aspectRatio: AspectRatio,
): EffectFamilyInstance {
  const resolvedFamily = resolveFamily(family);
  const style = resolveStartingStyle(resolvedFamily, startingStyleId);
  return {
    effectFamilyId: resolvedFamily.id,
    version: resolvedFamily.version,
    startingStyleId: style.id,
    aspectRatio,
    durationInFrames: resolvedFamily.defaultDurationInFrames,
    params: buildStyleDefaults(resolvedFamily, style, aspectRatio),
  };
}

/**
 * 中文注释：样式切换只替换声明为 replace 的表现参数；内容以及位置和尺寸始终从当前实例保留，
 * 目标样式无法容纳内容时返回警告而不静默删除条目。
 */
export function switchStartingStyle(
  family: string | EffectFamilyDefinition,
  instance: EffectFamilyInstance,
  startingStyleId: string,
): StartingStyleSwitchResult {
  const resolvedFamily = resolveFamilyVersion(family, instance.version);
  const style = resolveStartingStyle(resolvedFamily, startingStyleId);
  const targetValidation = validateEffectFamilyParams(
    resolvedFamily,
    buildStyleDefaults(resolvedFamily, style, instance.aspectRatio),
    { durationInFrames: instance.durationInFrames },
  );
  const targetDefaults = targetValidation.params;
  const sourceValidation = validateEffectFamilyParams(
    resolvedFamily,
    instance.params,
    { durationInFrames: instance.durationInFrames },
  );
  const sourceParams = sourceValidation.params;
  const nextParams: Record<string, unknown> = {};
  const changes: EffectFamilyParameterChange[] = [];
  const warnings: EffectFamilyIssue[] = [
    ...sourceValidation.warnings,
    ...targetValidation.warnings,
  ];

  for (const parameter of resolvedFamily.parameters) {
    const previousValue = sourceParams[parameter.key];
    const preserve = shouldPreserveParameter(parameter);
    const nextValue = preserve
      ? cloneValue(previousValue ?? targetDefaults[parameter.key])
      : cloneValue(targetDefaults[parameter.key]);
    const capacityWarning = preserve
      ? getContentCapacityWarning(parameter.key, nextValue, style)
      : undefined;
    if (capacityWarning) warnings.push(capacityWarning);
    nextParams[parameter.key] = nextValue;

    if (!valuesEqual(previousValue, nextValue)) {
      changes.push({
        key: parameter.key,
        previousValue: cloneValue(previousValue),
        nextValue: cloneValue(nextValue),
      });
    }
  }

  return {
    instance: {
      ...instance,
      startingStyleId: style.id,
      params: nextParams,
    },
    changes,
    errors: [...sourceValidation.errors, ...targetValidation.errors],
    warnings,
  };
}

/**
 * 中文注释：版本升级必须由调用方显式请求；模块只计算预览所需结果和差异，不修改项目或提交历史命令。
 */
export function upgradeEffectFamily(
  request: EffectFamilyUpgradeRequest,
): EffectFamilyUpgradeResult {
  const sourceFamily = getEffectFamily(request.familyId, request.fromVersion);
  const targetFamily = getEffectFamily(request.familyId, request.toVersion);
  const toVersion = targetFamily.version;
  const migrationPath = findMigrationPath(request.familyId, request.fromVersion, toVersion);
  const sourceParams = cloneValue(request.params);

  if (request.fromVersion === toVersion) {
    const normalized = normalizeParameterValuesWithDiagnostics(targetFamily.parameters, sourceParams);
    return {
      valid: normalized.errors.length === 0,
      fromVersion: request.fromVersion,
      toVersion,
      params: normalized.values,
      changes: [],
      droppedKeys: [],
      defaultedKeys: [],
      errors: normalized.errors,
      warnings: normalized.warnings,
    };
  }

  if (!migrationPath) {
    return {
      valid: false,
      fromVersion: request.fromVersion,
      toVersion,
      params: normalizeParameterValuesWithDiagnostics(targetFamily.parameters, {}).values,
      changes: [],
      droppedKeys: [],
      defaultedKeys: [],
      errors: [{
        code: "migration_unavailable",
        message: `没有从特效族 v${request.fromVersion} 升级到 v${toVersion} 的迁移路径`,
      }],
      warnings: [],
    };
  }

  let migratedParams = sourceParams;
  const droppedKeys = new Set<string>();
  const defaultedKeys = new Set<string>();
  const warnings: EffectFamilyIssue[] = [];

  for (const migration of migrationPath) {
    const output = migration.migrate(cloneValue(migratedParams));
    if (isMigrationOutput(output)) {
      migratedParams = cloneValue(output.params);
      output.droppedKeys?.forEach((key) => droppedKeys.add(key));
      output.defaultedKeys?.forEach((key) => defaultedKeys.add(key));
      output.warnings?.forEach((message) => warnings.push({ code: "migration_warning", message }));
    } else {
      migratedParams = cloneValue(output);
    }
  }

  const normalized = normalizeParameterValuesWithDiagnostics(targetFamily.parameters, migratedParams);
  const targetKeys = new Set(targetFamily.parameters.map((parameter) => parameter.key));
  for (const key of Object.keys(sourceParams)) {
    if (!targetKeys.has(key) || !Object.prototype.hasOwnProperty.call(migratedParams, key)) {
      droppedKeys.add(key);
    }
  }
  for (const key of Object.keys(migratedParams)) {
    if (!targetKeys.has(key)) {
      droppedKeys.add(key);
    }
  }
  for (const parameter of targetFamily.parameters) {
    if (!Object.prototype.hasOwnProperty.call(migratedParams, parameter.key)) {
      defaultedKeys.add(parameter.key);
    }
  }
  for (const error of normalized.errors) {
    defaultedKeys.add(error.key);
  }

  const changeKeys = new Set([...Object.keys(sourceParams), ...Object.keys(normalized.values)]);
  const changes = [...changeKeys]
    .filter((key) => !valuesEqual(sourceParams[key], normalized.values[key]))
    .map((key) => ({
      key,
      previousValue: cloneValue(sourceParams[key]),
      nextValue: cloneValue(normalized.values[key]),
    }));

  return {
    valid: normalized.errors.length === 0,
    fromVersion: sourceFamily.version,
    toVersion,
    params: normalized.values,
    changes,
    droppedKeys: [...droppedKeys].sort(),
    defaultedKeys: [...defaultedKeys].sort(),
    errors: normalized.errors,
    warnings: [
      ...warnings,
      ...normalized.warnings,
    ],
  };
}

/**
 * 中文注释：预览和导出都从同一请求生成渲染 props；帧、身份、随机种子和归一化参数在这里一次确定。
 */
export function createEffectRenderInput(request: EffectRenderInputRequest): EffectRenderInput {
  const family = getEffectFamily(request.familyId, request.version);
  resolveStartingStyle(family, request.startingStyleId);
  const durationInFrames = Number.isInteger(request.durationInFrames) && request.durationInFrames > 0
    ? request.durationInFrames
    : family.defaultDurationInFrames;
  const frame = Number.isFinite(request.frame)
    ? Math.max(0, Math.min(durationInFrames - 1, Math.round(request.frame)))
    : 0;
  const validation = validateEffectFamilyParams(family, request.params, { durationInFrames });
  const randomSeed = request.randomSeed ?? `${family.id}@${family.version}/${request.startingStyleId}/${request.aspectRatio}`;
  const renderProps = {
    frame,
    fps: request.fps,
    width: request.width,
    height: request.height,
    durationInFrames,
    params: validation.params,
    effectFamilyId: family.id,
    effectFamilyVersion: family.version,
    startingStyleId: request.startingStyleId,
    aspectRatio: request.aspectRatio,
    randomSeed,
  };

  return {
    family,
    renderProps,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

/** 中文注释：校验结果把错误和警告分开返回；错误值回退默认值，警告不会阻断继续预览。 */
export function validateEffectFamilyParams(
  family: string | EffectFamilyDefinition,
  params: Record<string, unknown> | undefined,
  _options: EffectFamilyValidationOptions = {},
): EffectFamilyValidationResult {
  const resolvedFamily = resolveFamily(family);
  const normalized = normalizeParameterValuesWithDiagnostics(
    resolvedFamily.parameters,
    params,
  );
  const compressed = compressAnimationStages(
    resolvedFamily.parameters,
    normalized.values,
    _options.durationInFrames,
  );

  return {
    valid: normalized.errors.length === 0,
    params: compressed.params,
    errors: normalized.errors,
    warnings: [...normalized.warnings, ...compressed.warnings],
  };
}
