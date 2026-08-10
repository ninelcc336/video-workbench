import type {
  AnimationPhaseValue,
  AnimationStageParameterDefinition,
  GradientParameterDefinition,
  GradientValue,
  IconParameterDefinition,
  FontParameterDefinition,
  ParameterDefinition,
  PositionParameterDefinition,
  SizeParameterDefinition,
  SpacingParameterDefinition,
  StructuredListParameterDefinition,
} from "./types";

type ParameterValue =
  | string
  | number
  | boolean
  | { x: number; y: number }
  | { width: number; height: number }
  | ReadonlyArray<Record<string, unknown>>
  | GradientValue
  | { top: number; right: number; bottom: number; left: number }
  | Record<string, AnimationPhaseValue>;

export type ParameterDiagnostic = {
  key: string;
  code: "invalid_parameter" | "unknown_parameter" | "layout_overflow";
  message: string;
};

export type ParameterNormalizationResult = {
  values: Record<string, ParameterValue>;
  errors: ParameterDiagnostic[];
  warnings: ParameterDiagnostic[];
};

type NormalizationOutcome =
  | { valid: true; value: ParameterValue }
  | { valid: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);

const isInRange = (value: number, min?: number, max?: number): boolean =>
  (min === undefined || value >= min) && (max === undefined || value <= max);

const isPosition = (
  parameter: PositionParameterDefinition,
  value: unknown,
): value is { x: number; y: number } => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("x" in value) ||
    !("y" in value)
  ) {
    return false;
  }

  const position = value as { x: unknown; y: unknown };
  // 中文注释：基础布局使用 0 到 1 的画布比例，高级越界模式则保留有限值并在外层提示。
  return (
    isFiniteNumber(position.x) &&
    isFiniteNumber(position.y) &&
    isInRange(
      position.x,
      parameter.minX ?? (parameter.safety === "warn-on-overflow" ? undefined : 0),
      parameter.maxX ?? (parameter.safety === "warn-on-overflow" ? undefined : 1),
    ) &&
    isInRange(
      position.y,
      parameter.minY ?? (parameter.safety === "warn-on-overflow" ? undefined : 0),
      parameter.maxY ?? (parameter.safety === "warn-on-overflow" ? undefined : 1),
    )
  );
};

const isSize = (
  parameter: SizeParameterDefinition,
  value: unknown,
): value is { width: number; height: number } => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("width" in value) ||
    !("height" in value)
  ) {
    return false;
  }

  const size = value as { width: unknown; height: unknown };
  // 中文注释：尺寸保存为画布比例；默认限制在可见范围，高级模式可只提示而不强制截断。
  return (
    isFiniteNumber(size.width) &&
    isFiniteNumber(size.height) &&
    isInRange(
      size.width,
      parameter.minWidth ?? (parameter.safety === "warn-on-overflow" ? undefined : 0),
      parameter.maxWidth ?? (parameter.safety === "warn-on-overflow" ? undefined : 1),
    ) &&
    isInRange(
      size.height,
      parameter.minHeight ?? (parameter.safety === "warn-on-overflow" ? undefined : 0),
      parameter.maxHeight ?? (parameter.safety === "warn-on-overflow" ? undefined : 1),
    )
  );
};

/** 中文注释：允许越界的布局仍保留原值，只在公共诊断中标成警告供高级面板提示。 */
function hasLayoutOverflowWarning(parameter: ParameterDefinition, value: unknown): boolean {
  if (parameter.safety !== "warn-on-overflow") return false;
  if (parameter.type === "position" && isRecord(value)) {
    return [value.x, value.y].some((item) => typeof item === "number" && (item < 0 || item > 1));
  }
  if (parameter.type === "size" && isRecord(value)) {
    return [value.width, value.height].some((item) => typeof item === "number" && (item < 0 || item > 1));
  }
  return false;
}

/** 中文注释：动画阶段只接受可任意帧求值的有限数值和声明字符串，拒绝真实时间等不可重复输入。 */
function isValidAnimationPhase(value: unknown): value is AnimationPhaseValue {
  if (!isRecord(value)) return false;

  return (
    isFiniteNumber(value.durationInFrames) &&
    value.durationInFrames >= 0 &&
    isFiniteNumber(value.delayInFrames) &&
    value.delayInFrames >= 0 &&
    typeof value.direction === "string" &&
    typeof value.easing === "string" &&
    isFiniteNumber(value.intensity) &&
    value.intensity >= 0 &&
    isFiniteNumber(value.stagger) &&
    value.stagger >= 0
  );
}

/** 中文注释：渐变归一化前先限制色标数量、偏移和颜色格式，避免非法对象进入 SVG/CSS 渲染。 */
function isGradient(parameter: GradientParameterDefinition, value: unknown): value is GradientValue {
  if (!isRecord(value) || !isFiniteNumber(value.angle) || !Array.isArray(value.stops)) {
    return false;
  }

  if (
    (parameter.minStops !== undefined && value.stops.length < parameter.minStops) ||
    (parameter.maxStops !== undefined && value.stops.length > parameter.maxStops)
  ) {
    return false;
  }

  return value.stops.every((stop) =>
    isRecord(stop) &&
    isFiniteNumber(stop.offset) &&
    isInRange(stop.offset, 0, 1) &&
    isHexColor(stop.color),
  );
}

/** 中文注释：间距按四边结构保存，保证属性面板和渲染器不会依赖分隔符字符串协议。 */
function isSpacing(parameter: SpacingParameterDefinition, value: unknown): value is {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.top) ||
    !isFiniteNumber(value.right) ||
    !isFiniteNumber(value.bottom) ||
    !isFiniteNumber(value.left)
  ) {
    return false;
  }

  return [value.top, value.right, value.bottom, value.left]
    .every((item) => isInRange(item, parameter.min ?? 0, parameter.max));
}

/** 中文注释：字体和图标只允许审核过的稳定资源 ID，不接受绝对路径或远程地址。 */
function isAssetOption(
  parameter: FontParameterDefinition | IconParameterDefinition,
  value: unknown,
): value is string {
  return typeof value === "string" && parameter.options.some((option) => option.value === value);
}

/** 中文注释：结构化条目递归经过字段 schema 校验，渲染输入只保留声明字段。 */
function isStructuredList(
  parameter: StructuredListParameterDefinition,
  value: unknown,
): value is ReadonlyArray<Record<string, unknown>> {
  if (!Array.isArray(value)) return false;
  if (
    (parameter.minItems !== undefined && value.length < parameter.minItems) ||
    (parameter.maxItems !== undefined && value.length > parameter.maxItems)
  ) {
    return false;
  }

  return value.every((item) => {
    if (!isRecord(item)) return false;
    return normalizeParameterValuesWithDiagnostics(parameter.itemSchema, item).errors.length === 0;
  });
}

/** 中文注释：阶段字段只按族声明的 enter、sustain、exit 子集读取，未知阶段不会泄漏。 */
function isAnimationStage(
  parameter: AnimationStageParameterDefinition,
  value: unknown,
): value is Record<string, AnimationPhaseValue> {
  if (!isRecord(value)) return false;
  return parameter.stages.every((stage) => {
    const phase = value[stage];
    return phase === undefined || isValidAnimationPhase(phase);
  });
}

/** 中文注释：按参数类型执行白名单归一化；对象值重建而不是原样复制，以隔离外部 JSON。 */
function normalizeValue(parameter: ParameterDefinition, value: unknown): NormalizationOutcome {
  switch (parameter.type) {
    case "text":
    case "multiline-text":
      return typeof value === "string" &&
        (parameter.maxLength === undefined || value.length <= parameter.maxLength)
        ? { valid: true, value }
        : { valid: false, message: "文本值不符合声明的长度约束" };
    case "color":
      return isHexColor(value)
        ? { valid: true, value }
        : { valid: false, message: "颜色必须是十六进制颜色" };
    case "number":
      return isFiniteNumber(value) && isInRange(value, parameter.min, parameter.max)
        ? { valid: true, value }
        : { valid: false, message: "数字值不是有限数或超出约束范围" };
    case "select":
      return typeof value === "string" && parameter.options.some((option) => option.value === value)
        ? { valid: true, value }
        : { valid: false, message: "枚举值不在声明选项中" };
    case "boolean":
      return typeof value === "boolean"
        ? { valid: true, value }
        : { valid: false, message: "开关值必须是布尔值" };
    case "position":
      return isPosition(parameter, value)
        ? { valid: true, value: { x: value.x, y: value.y } }
        : { valid: false, message: "位置不是有限的画布比例或超出约束范围" };
    case "size":
      return isSize(parameter, value)
        ? { valid: true, value: { width: value.width, height: value.height } }
        : { valid: false, message: "尺寸不是有限的画布比例或超出约束范围" };
    case "structured-list":
      if (!isStructuredList(parameter, value)) {
        return { valid: false, message: "结构化列表不是有效条目数组或超出条目约束" };
      }
      return {
        valid: true,
        value: value.map((item) =>
          normalizeParameterValuesWithDiagnostics(parameter.itemSchema, item).values,
        ),
      };
    case "gradient":
      if (!isGradient(parameter, value)) {
        return { valid: false, message: "渐变不是有效的角度和色标数组" };
      }
      return {
        valid: true,
        value: {
          angle: value.angle,
          stops: value.stops.map((stop) => ({ offset: stop.offset, color: stop.color })),
        },
      };
    case "spacing":
      return isSpacing(parameter, value)
        ? {
            valid: true,
            value: {
              top: value.top,
              right: value.right,
              bottom: value.bottom,
              left: value.left,
            },
          }
        : { valid: false, message: "间距必须由四个有限数值组成并符合范围" };
    case "font":
    case "icon":
      return isAssetOption(parameter, value)
        ? { valid: true, value }
        : { valid: false, message: "素材槽位值不在已审核的本地选项中" };
    case "animation-stage":
      return isAnimationStage(parameter, value)
        ? {
            valid: true,
            value: Object.fromEntries(
              parameter.stages
                .filter((stage) => value[stage] !== undefined)
                .map((stage) => [stage, structuredClone(value[stage])]),
            ),
          }
        : { valid: false, message: "动画阶段声明包含非法阶段或数值" };
  }
}

export const getDefaultParams = (
  parameters: ReadonlyArray<ParameterDefinition>,
): Record<string, ParameterValue> =>
  Object.fromEntries(
    parameters.map((parameter) => [parameter.key, structuredClone(parameter.defaultValue)]),
  );

export const normalizeParameterValues = (
  parameters: ReadonlyArray<ParameterDefinition>,
  values: Record<string, unknown> | undefined,
): Record<string, ParameterValue> => normalizeParameterValuesWithDiagnostics(parameters, values).values;

/**
 * 中文注释：归一化新版参数并返回诊断；无效字段只使用声明默认值，未知字段被丢弃，
 * 因此调用方无需把项目 JSON 的清洗逻辑复制到编辑器或渲染器中。
 */
export function normalizeParameterValuesWithDiagnostics(
  parameters: ReadonlyArray<ParameterDefinition>,
  values: Record<string, unknown> | undefined,
): ParameterNormalizationResult {
  const input = values ?? {};
  const parameterKeys = new Set(parameters.map((parameter) => parameter.key));
  const warnings: ParameterDiagnostic[] = Object.keys(input)
    .filter((key) => !parameterKeys.has(key))
    .map((key) => ({
      key,
      code: "unknown_parameter" as const,
      message: `未知参数“${key}”已被忽略`,
    }));
  const errors: ParameterDiagnostic[] = [];

  const normalizedValues = Object.fromEntries(
    parameters.map((parameter) => {
      const value = input[parameter.key];
      // 中文注释：部分更新只提交改变字段，缺失字段使用默认值但不制造阻断错误。
      if (value === undefined) {
        return [parameter.key, structuredClone(parameter.defaultValue)];
      }
      const outcome = normalizeValue(parameter, value);
      if (outcome.valid) {
        if (hasLayoutOverflowWarning(parameter, outcome.value)) {
          warnings.push({
            key: parameter.key,
            code: "layout_overflow",
            message: `参数“${parameter.label}”超出安全区域，已保留高级设置`,
          });
        }
        return [parameter.key, structuredClone(outcome.value)];
      }

      errors.push({
        key: parameter.key,
        code: "invalid_parameter",
        message: `参数“${parameter.label}”无效，已回退默认值：${outcome.message}`,
      });
      return [parameter.key, structuredClone(parameter.defaultValue)];
    }),
  );

  return { values: normalizedValues, errors, warnings };
}
