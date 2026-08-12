import type {
  AspectRatio,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  EffectFamilySummary,
  EffectParameterDefinition,
  ParameterDefinition,
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
};

export type EffectFamilyInstance = {
  effectFamilyId: string;
  version: number;
  startingStyleId: string;
  aspectRatio: AspectRatio;
  durationInFrames: number;
  params: Record<string, unknown>;
};

/**
 * 中文注释：把内置声明中的基础参数补齐为当前族契约需要的元数据；它只在注册当前代码声明时运行，
 * 不读取、不识别任何历史持久化格式，因此不会形成旧数据兼容路径。
 */
export function defineEffectFamily(
  family: Omit<EffectFamilyDefinition, "parameters"> & {
    parameters: ReadonlyArray<ParameterDefinition>;
  },
): EffectFamilyDefinition {
  const parameters = family.parameters.map((parameter) => {
    const group = parameter.group ?? (
      parameter.type === "position" || parameter.type === "size" || parameter.type === "spacing"
        ? "layout"
        : parameter.type === "text" || parameter.type === "multiline-text" || parameter.type === "structured-list" || parameter.type === "icon"
          ? "content"
          : parameter.type === "animation-stage"
            ? "animation"
            : "appearance"
    );
    return {
      ...parameter,
      group,
      level: parameter.level ?? "basic",
      styleSwitch: parameter.styleSwitch ?? (
        group === "content" || parameter.type === "position" || parameter.type === "size"
          ? "preserve"
          : "replace"
      ),
    };
  });

  return { ...family, parameters } as EffectFamilyDefinition;
}

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
  aspectRatioLayoutKeys: string[];
  useAspectRatioLayout: boolean;
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

export type StartingStyleSwitchOptions = {
  useAspectRatioLayout?: boolean;
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
  if (family.purposeTags.length === 0 || family.visualDirections.length === 0) {
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

/** 中文注释：显式版本用于当前数据校验；省略版本时只取唯一的当前声明。 */
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
    .map(({ parameters: _parameters, render: _render, startingStyles, ...summary }) => ({
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

/** 中文注释：只把当前画幅明确声明的位置信息作为可选布局覆盖，避免确认时误重置用户尺寸或其他布局参数。 */
function getAspectRatioLayoutKeys(
  family: EffectFamilyDefinition,
  style: EffectFamilyDefinition["startingStyles"][number],
  aspectRatio: AspectRatio,
): string[] {
  const aspectRatioDefaults = {
    ...family.aspectRatioDefaults[aspectRatio],
    ...style.aspectRatioDefaults?.[aspectRatio],
  };
  return family.parameters
    .filter((parameter) => (
      parameter.group === "layout" &&
      (parameter.type === "position" || parameter.type === "size") &&
      Object.prototype.hasOwnProperty.call(aspectRatioDefaults, parameter.key)
    ))
    .map((parameter) => parameter.key);
}

/** 中文注释：内容始终保留，位置和尺寸默认保留，其余参数服从声明的样式切换策略。 */
function shouldPreserveParameter(
  parameter: EffectFamilyDefinition["parameters"][number],
  useAspectRatioLayout: boolean,
): boolean {
  if (parameter.group === "content") return true;
  if (
    parameter.group === "layout" &&
    (parameter.type === "position" || parameter.type === "size")
  ) {
    return !useAspectRatioLayout;
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
  options: StartingStyleSwitchOptions = {},
): StartingStyleSwitchResult {
  const resolvedFamily = resolveFamilyVersion(family, instance.version);
  const style = resolveStartingStyle(resolvedFamily, startingStyleId);
  const aspectRatioLayoutKeys = getAspectRatioLayoutKeys(resolvedFamily, style, instance.aspectRatio);
  const useAspectRatioLayout = options.useAspectRatioLayout === true;
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
    const preserve = shouldPreserveParameter(
      parameter,
      useAspectRatioLayout && aspectRatioLayoutKeys.includes(parameter.key),
    );
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
    aspectRatioLayoutKeys,
    useAspectRatioLayout,
    errors: [...sourceValidation.errors, ...targetValidation.errors],
    warnings,
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
