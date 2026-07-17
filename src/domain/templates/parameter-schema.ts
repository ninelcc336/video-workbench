import type {
  ParameterDefinition,
  PositionParameterDefinition,
  SizeParameterDefinition,
} from "./types";

type ParameterValue = string | number | boolean | { x: number; y: number } | { width: number; height: number };

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
  // 中文注释：位置使用 0 到 1 的画布比例；这样同一预设能适配不同分辨率。
  return (
    isFiniteNumber(position.x) &&
    isFiniteNumber(position.y) &&
    isInRange(position.x, parameter.minX ?? 0, parameter.maxX ?? 1) &&
    isInRange(position.y, parameter.minY ?? 0, parameter.maxY ?? 1)
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
  // 中文注释：尺寸同样保存为画布比例，并限制在可见画布范围内。
  return (
    isFiniteNumber(size.width) &&
    isFiniteNumber(size.height) &&
    isInRange(size.width, parameter.minWidth ?? 0, parameter.maxWidth ?? 1) &&
    isInRange(size.height, parameter.minHeight ?? 0, parameter.maxHeight ?? 1)
  );
};

const isValidValue = (parameter: ParameterDefinition, value: unknown): value is ParameterValue => {
  switch (parameter.type) {
    case "text":
      return typeof value === "string" &&
        (parameter.maxLength === undefined || value.length <= parameter.maxLength);
    case "color":
      return isHexColor(value);
    case "number":
      return isFiniteNumber(value) && isInRange(value, parameter.min, parameter.max);
    case "select":
      return typeof value === "string" && parameter.options.some((option) => option.value === value);
    case "boolean":
      return typeof value === "boolean";
    case "position":
      return isPosition(parameter, value);
    case "size":
      return isSize(parameter, value);
  }
};

export const getDefaultParams = (
  parameters: ReadonlyArray<ParameterDefinition>,
): Record<string, ParameterValue> =>
  Object.fromEntries(
    parameters.map((parameter) => [parameter.key, structuredClone(parameter.defaultValue)]),
  );

export const normalizeParameterValues = (
  parameters: ReadonlyArray<ParameterDefinition>,
  values: Record<string, unknown> | undefined,
): Record<string, ParameterValue> => {
  const input = values ?? {};

  return Object.fromEntries(
    parameters.map((parameter) => {
      const value = input[parameter.key];
      // 中文注释：不信任项目 JSON 中的旧值或未知值，异常值统一回到模板默认值。
      return [
        parameter.key,
        isValidValue(parameter, value)
          ? structuredClone(value)
          : structuredClone(parameter.defaultValue),
      ];
    }),
  );
};
