import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import type { EditProject, EffectClip } from "../../domain/project/model";
import { getBoundaryTransitionWarnings } from "../../domain/project/transition";
import {
  createEffectFamilyInstance,
  getAspectRatioForCanvas,
  getEffectFamily,
} from "../../domain/templates/effect-family";
import {
  getDefaultParams,
  normalizeParameterValuesWithDiagnostics,
} from "../../domain/templates/parameter-schema";
import type {
  AnimationPhaseValue,
  AnimationStageParameterDefinition,
  GradientParameterDefinition,
  GradientValue,
  ParameterDefinition,
  ParameterGroup,
  ParameterLevel,
  PositionParameterDefinition,
  SizeParameterDefinition,
  SpacingParameterDefinition,
  StructuredListParameterDefinition,
  EffectFamilyDefinition,
} from "../../domain/templates/types";

export type PropertiesPanelProps = {
  project: EditProject;
  selectedClip: EffectClip | null;
  /** 中文注释：与画布共享的临时参数快照；未提供时回退到选中片段的持久化参数。 */
  paramsSnapshot?: Record<string, unknown>;
  /** 中文注释：连续控件手势只更新过程预览，不直接增加编辑历史。 */
  onPreviewParams?: (clipId: string, params: Record<string, unknown>) => void;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
  /** 中文注释：样式选择只向页面命令层发送族内样式身份，面板不直接修改项目快照。 */
  onSwitchStartingStyle?: (clipId: string, startingStyleId: string) => void;
};

type EditorMode = "basic" | "advanced";

type PanelDiagnostic = {
  key?: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

const GROUP_ORDER: ParameterGroup[] = ["content", "layout", "appearance", "animation", "behavior"];

const GROUP_LABELS: Record<ParameterGroup, string> = {
  content: "内容",
  layout: "布局",
  appearance: "外观",
  animation: "动画",
  behavior: "行为",
};

const STAGE_LABELS: Record<"enter" | "sustain" | "exit", string> = {
  enter: "入场",
  sustain: "持续",
  exit: "出场",
};

const COLOR_PALETTE = [
  "#111827",
  "#ffffff",
  "#14b8a6",
  "#38bdf8",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#111312",
];

const DIRECTION_OPTIONS = [
  { value: "none", label: "无" },
  { value: "left", label: "左侧" },
  { value: "right", label: "右侧" },
  { value: "top", label: "上方" },
  { value: "bottom", label: "下方" },
];

const EASING_OPTIONS = [
  { value: "linear", label: "线性" },
  { value: "ease-in", label: "渐入" },
  { value: "ease-out", label: "渐出" },
  { value: "ease-in-out", label: "渐入渐出" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/** 中文注释：面板只消费深模块声明的分组；极少数未注册兼容模板没有元数据时统一归入外观。 */
function getParameterGroup(parameter: ParameterDefinition): ParameterGroup {
  return parameter.group ?? "appearance";
}

function getParameterLevel(parameter: ParameterDefinition): ParameterLevel {
  return parameter.level ?? "basic";
}

/** 中文注释：属性面板只消费当前特效族声明，不为旧模板保留参数或渲染回退。 */
function getPanelParameters(family: EffectFamilyDefinition): ReadonlyArray<ParameterDefinition> {
  return family.parameters;
}

function getControlLabel(definition: ParameterDefinition, labelSuffix?: string): string {
  return `${definition.label}${labelSuffix ?? ""}`;
}

function getDescriptionId(idPrefix: string, key: string): string {
  return `${idPrefix}-description-${key}`;
}

function getDiagnosticId(idPrefix: string, key: string): string {
  return `${idPrefix}-diagnostic-${key}`;
}

function parseFiniteNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  return Math.min(max ?? value, Math.max(min ?? value, value));
}

/** 中文注释：基础模式给可越界布局强制补上 0 到 1 的安全边界，高级模式才允许输入越界值。 */
function getLayoutBounds(
  definition: PositionParameterDefinition | SizeParameterDefinition,
  field: "x" | "y" | "width" | "height",
  mode: EditorMode,
): { min?: number; max?: number } {
  const bounds = definition.type === "position"
    ? {
        x: { min: definition.minX, max: definition.maxX },
        y: { min: definition.minY, max: definition.maxY },
      }[field as "x" | "y"]
    : {
        width: { min: definition.minWidth, max: definition.maxWidth },
        height: { min: definition.minHeight, max: definition.maxHeight },
      }[field as "width" | "height"];

  if (mode === "basic" && definition.safety === "warn-on-overflow") {
    return { min: bounds.min ?? 0, max: bounds.max ?? 1 };
  }
  return bounds;
}

function updateObjectParam(
  values: Record<string, unknown>,
  key: string,
  field: string,
  value: number,
): Record<string, unknown> {
  const current = values[key];
  const objectValue = isRecord(current) ? current : {};
  return { [key]: { ...objectValue, [field]: value } };
}

function getHexRgb(value: string): [number, number, number] | null {
  const normalized = value.replace("#", "");
  if (![3, 4, 6, 8].includes(normalized.length) || !/^[\da-f]+$/iu.test(normalized)) return null;
  const expand = normalized.length <= 4
    ? normalized.slice(0, 3).split("").map((item) => `${item}${item}`).join("")
    : normalized.slice(0, 6);
  return [
    Number.parseInt(expand.slice(0, 2), 16),
    Number.parseInt(expand.slice(2, 4), 16),
    Number.parseInt(expand.slice(4, 6), 16),
  ];
}

/** 中文注释：用 WCAG 相对亮度估算文字与背景对比度，提示不阻断编辑的可读性风险。 */
function getContrastRatio(first: string, second: string): number | null {
  const firstRgb = getHexRgb(first);
  const secondRgb = getHexRgb(second);
  if (!firstRgb || !secondRgb) return null;

  const luminance = (rgb: [number, number, number]): number => {
    const channels = rgb.map((channel) => channel / 255).map((channel) => (
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const brighter = Math.max(luminance(firstRgb), luminance(secondRgb));
  const darker = Math.min(luminance(firstRgb), luminance(secondRgb));
  return (brighter + 0.05) / (darker + 0.05);
}

/** 中文注释：诊断同时合并领域层错误/警告与面板能观察到的文本、对比度和渲染负载风险。 */
function buildPanelDiagnostics(
  parameters: ReadonlyArray<ParameterDefinition>,
  rawParams: Record<string, unknown>,
  normalized: ReturnType<typeof normalizeParameterValuesWithDiagnostics>,
): PanelDiagnostic[] {
  const diagnostics: PanelDiagnostic[] = [
    ...normalized.errors.map((item) => ({ ...item, severity: "error" as const })),
    ...normalized.warnings.map((item) => ({ ...item, severity: "warning" as const })),
  ];
  const diagnosticKeys = new Set(diagnostics.map((item) => `${item.code}:${item.key ?? ""}`));
  const addWarning = (key: string, code: string, message: string): void => {
    const identity = `${code}:${key}`;
    if (diagnosticKeys.has(identity)) return;
    diagnostics.push({ key, code, message, severity: "warning" });
    diagnosticKeys.add(identity);
  };

  for (const parameter of parameters) {
    const rawValue = rawParams[parameter.key];
    if ((parameter.type === "text" || parameter.type === "multiline-text") && typeof rawValue === "string") {
      const threshold = parameter.maxLength === undefined
        ? 80
        : Math.max(20, Math.floor(parameter.maxLength * 0.8));
      if (rawValue.length > threshold) {
        addWarning(parameter.key, "long_text", `参数“${parameter.label}”文本较长，可能需要调整字号或尺寸`);
      }
    }
    if (parameter.type === "structured-list" && Array.isArray(rawValue) && parameter.maxItems !== undefined) {
      if (parameter.maxItems >= 8 && rawValue.length >= parameter.maxItems) {
        addWarning(parameter.key, "render_load", `参数“${parameter.label}”条目较多，渲染负载较高`);
      }
    }
    if (parameter.type === "number" && typeof rawValue === "number" && Number.isFinite(rawValue)) {
      const key = parameter.key.toLocaleLowerCase("zh-CN");
      if ((key.includes("density") || key.includes("particle")) && parameter.max !== undefined) {
        const min = parameter.min ?? 0;
        const threshold = min + (parameter.max - min) * 0.8;
        if (rawValue >= threshold) addWarning(parameter.key, "render_load", `参数“${parameter.label}”渲染负载较高`);
      }
    }
  }

  const colorParameters = parameters.filter((parameter) => parameter.type === "color");
  const foreground = colorParameters.find((parameter) => /text|foreground|label|title/iu.test(parameter.key));
  const background = colorParameters.find((parameter) => (
    parameter.key !== foreground?.key && /background|panel|card|fill/iu.test(parameter.key)
  ));
  if (foreground && background) {
    const foregroundValue = normalized.values[foreground.key];
    const backgroundValue = normalized.values[background.key];
    if (typeof foregroundValue === "string" && typeof backgroundValue === "string") {
      const contrast = getContrastRatio(foregroundValue, backgroundValue);
      if (contrast !== null && contrast < 4.5) {
        addWarning(foreground.key, "low_contrast", `参数“${foreground.label}”与${background.label}对比度不足，可能影响可读性`);
      }
    }
  }

  return diagnostics;
}

/** 中文注释：基础模式只展示声明的前八个基础参数，超出部分仍可在高级面板中按分组访问。 */
function getBasicParameters(parameters: ReadonlyArray<ParameterDefinition>): ParameterDefinition[] {
  return parameters.filter((parameter) => getParameterLevel(parameter) === "basic").slice(0, 8);
}

/** 中文注释：按当前片段的起始样式和画幅生成分组重置值，重置不会回退到其他族或旧模板默认值。 */
function getResetParams(
  family: EffectFamilyDefinition,
  startingStyleId: string,
  project: EditProject,
): Record<string, unknown> {
  return createEffectFamilyInstance(
    family,
    startingStyleId,
    getAspectRatioForCanvas(project.settings.width, project.settings.height),
  ).params;
}

function DiagnosticMessages({ diagnostics }: { diagnostics: PanelDiagnostic[] }): ReactNode {
  return diagnostics.map((diagnostic, index) => (
    <p
      className={`property-diagnostic property-diagnostic--${diagnostic.severity}`}
      key={`${diagnostic.code}-${diagnostic.key ?? "panel"}-${index}`}
      role={diagnostic.severity === "error" ? "alert" : "status"}
    >
      {diagnostic.message}
    </p>
  ));
}

function ColorInput({
  label,
  value,
  onChange,
  describedBy,
  errorMessageId,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  return (
    <div className="color-input">
      <input
        aria-describedby={describedBy}
        aria-errormessage={invalid ? errorMessageId : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
      <code aria-live="polite">{value}</code>
      <div aria-label={`${label}色板`} className="color-palette" role="group">
        {COLOR_PALETTE.map((color) => (
          <button
            aria-label={`${label}预设色 ${color}`}
            className="color-palette__swatch"
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            title={color}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

/** 中文注释：范围参数在拖动期间只发过程预览，松手或失焦时再提交一次正式变更。 */
function NumericParameterControl({
  definition,
  value,
  label,
  describedBy,
  onChange,
  onPreview,
  errorMessageId,
  invalid = false,
}: {
  definition: Extract<ParameterDefinition, { type: "number" }>;
  value: number;
  label: string;
  describedBy?: string;
  onChange: (params: Record<string, unknown>) => void;
  onPreview?: (params: Record<string, unknown>) => void;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  const hasRange = definition.min !== undefined && definition.max !== undefined;
  const [draftValue, setDraftValue] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const previewingRef = useRef(false);

  useEffect(() => {
    setDraftValue(value);
    draftRef.current = value;
    if (!previewingRef.current) committedRef.current = value;
  }, [value]);

  const commitDraft = () => {
    const nextValue = draftRef.current;
    previewingRef.current = false;
    if (!Object.is(nextValue, committedRef.current)) {
      onChange({ [definition.key]: nextValue });
      committedRef.current = nextValue;
    }
  };

  const updateDraft = (nextValue: number) => {
    setDraftValue(nextValue);
    draftRef.current = nextValue;
    if (onPreview) {
      previewingRef.current = true;
      onPreview({ [definition.key]: nextValue });
    } else {
      onChange({ [definition.key]: nextValue });
      committedRef.current = nextValue;
    }
  };

  const updateExactValue = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = parseFiniteNumber(event.target.value);
    if (nextValue === undefined) return;
    const constrainedValue = clamp(nextValue, definition.min, definition.max);
    setDraftValue(constrainedValue);
    draftRef.current = constrainedValue;
    previewingRef.current = false;
    onChange({ [definition.key]: constrainedValue });
    committedRef.current = constrainedValue;
  };

  return (
    <div className={`property-number${hasRange ? " property-number--range" : ""}`}>
      {hasRange ? (
        <input
          aria-describedby={describedBy}
          aria-errormessage={invalid ? errorMessageId : undefined}
          aria-label={`${label}滑杆`}
          aria-invalid={invalid || undefined}
          className="property-number__range"
          max={definition.max}
          min={definition.min}
          onBlur={commitDraft}
          onChange={(event) => {
            const nextValue = parseFiniteNumber(event.target.value);
            if (nextValue !== undefined) updateDraft(nextValue);
          }}
          onKeyUp={(event) => {
            if (["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(event.key)) {
              commitDraft();
            }
          }}
          onPointerUp={commitDraft}
          step={definition.step}
          type="range"
          value={draftValue}
        />
      ) : null}
      <input
        aria-describedby={describedBy}
        aria-errormessage={invalid ? errorMessageId : undefined}
        aria-label={hasRange ? `${label}精确输入` : label}
        aria-invalid={invalid || undefined}
        max={definition.max}
        min={definition.min}
        onChange={updateExactValue}
        step={definition.step}
        type="number"
        value={draftValue}
      />
    </div>
  );
}

type ParameterControlProps = {
  definition: ParameterDefinition;
  values: Record<string, unknown>;
  mode: EditorMode;
  diagnostics?: PanelDiagnostic[];
  idPrefix: string;
  labelSuffix?: string;
  onChange: (params: Record<string, unknown>) => void;
  onPreview?: (params: Record<string, unknown>) => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

/** 中文注释：复合参数共享同一控件入口，保持参数声明与编辑器 UI 的边界稳定。 */
function ParameterControl({
  definition,
  values,
  mode,
  diagnostics = [],
  idPrefix,
  labelSuffix,
  onChange,
  onPreview,
  onPaste,
}: ParameterControlProps): ReactNode {
  const value = values[definition.key] ?? definition.defaultValue;
  const label = getControlLabel(definition, labelSuffix);
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const descriptionId = getDescriptionId(idPrefix, definition.key);
  const diagnosticId = getDiagnosticId(idPrefix, definition.key);
  const describedBy = [definition.description ? descriptionId : undefined, diagnostics.length > 0 ? diagnosticId : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
  const frame = (control: ReactNode) => (
    <div className={`property-control property-control--${definition.type}`} data-property-type={definition.type}>
      <span className="property-control__label">{definition.label}{labelSuffix ?? ""}</span>
      {definition.description ? <small className="property-control__description" id={descriptionId}>{definition.description}</small> : null}
      {control}
      {diagnostics.length > 0 ? <div id={diagnosticId}><DiagnosticMessages diagnostics={diagnostics} /></div> : null}
    </div>
  );

  if (definition.type === "position" || definition.type === "size") {
    const isPosition = definition.type === "position";
    const objectValue = isRecord(value) ? value : {};
    const firstKey = isPosition ? "x" : "width";
    const secondKey = isPosition ? "y" : "height";
    const firstLabel = isPosition ? "X" : "宽度";
    const secondLabel = isPosition ? "Y" : "高度";
    const firstBounds = getLayoutBounds(definition, firstKey, mode);
    const secondBounds = getLayoutBounds(definition, secondKey, mode);
    const updateLayoutValue = (field: string, bounds: { min?: number; max?: number }, event: ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFiniteNumber(event.target.value);
      if (parsed === undefined) return;
      const nextValue = mode === "basic" && definition.safety === "warn-on-overflow"
        ? clamp(parsed, bounds.min, bounds.max)
        : parsed;
      onChange(updateObjectParam(values, definition.key, field, nextValue));
    };

    return (
      <fieldset className="property-fieldset" data-property-type={definition.type}>
        <legend>{definition.label}{labelSuffix ?? ""}</legend>
        {definition.description ? <p className="property-control__description" id={descriptionId}>{definition.description}</p> : null}
        <div className="property-grid property-grid--two">
          <label>
            <span>{firstLabel}</span>
            <input
              aria-describedby={describedBy}
              aria-errormessage={hasError ? diagnosticId : undefined}
              aria-label={`${label}${firstLabel}`}
              aria-invalid={hasError || undefined}
              max={firstBounds.max}
              min={firstBounds.min}
              onChange={(event) => updateLayoutValue(firstKey, firstBounds, event)}
              step={0.01}
              type="number"
              value={Number(objectValue[firstKey] ?? 0)}
            />
          </label>
          <label>
            <span>{secondLabel}</span>
            <input
              aria-describedby={describedBy}
              aria-errormessage={hasError ? diagnosticId : undefined}
              aria-label={`${label}${secondLabel}`}
              aria-invalid={hasError || undefined}
              max={secondBounds.max}
              min={secondBounds.min}
              onChange={(event) => updateLayoutValue(secondKey, secondBounds, event)}
              step={0.01}
              type="number"
              value={Number(objectValue[secondKey] ?? 0)}
            />
          </label>
        </div>
        {diagnostics.length > 0 ? <div id={diagnosticId}><DiagnosticMessages diagnostics={diagnostics} /></div> : null}
      </fieldset>
    );
  }

  if (definition.type === "text" || definition.type === "multiline-text") {
    return frame(
      definition.type === "multiline-text" ? (
        <textarea
          aria-describedby={describedBy}
          aria-errormessage={hasError ? diagnosticId : undefined}
          aria-label={label}
          aria-invalid={hasError || undefined}
          maxLength={definition.maxLength}
          onChange={(event) => onChange({ [definition.key]: event.target.value })}
          onPaste={onPaste}
          rows={4}
          value={String(value)}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-errormessage={hasError ? diagnosticId : undefined}
          aria-label={label}
          aria-invalid={hasError || undefined}
          maxLength={definition.maxLength}
          onChange={(event) => onChange({ [definition.key]: event.target.value })}
          onPaste={onPaste}
          type="text"
          value={String(value)}
        />
      ),
    );
  }

  if (definition.type === "color") {
    return frame(
      <ColorInput
        describedBy={describedBy}
        errorMessageId={diagnosticId}
        label={label}
        onChange={(nextValue) => onChange({ [definition.key]: nextValue })}
        invalid={hasError}
        value={String(value)}
      />,
    );
  }

  if (definition.type === "number") {
    const numericValue = typeof value === "number" && Number.isFinite(value)
      ? value
      : definition.defaultValue;
    return frame(
      <NumericParameterControl
        definition={definition}
        describedBy={describedBy}
        label={label}
        onChange={onChange}
        onPreview={onPreview}
        errorMessageId={diagnosticId}
        invalid={hasError}
        value={numericValue}
      />,
    );
  }

  if (definition.type === "select") {
    return frame(
      <select
        aria-describedby={describedBy}
        aria-errormessage={hasError ? diagnosticId : undefined}
        aria-label={label}
        aria-invalid={hasError || undefined}
        onChange={(event) => onChange({ [definition.key]: event.target.value })}
        value={String(value)}
      >
        {definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>,
    );
  }

  if (definition.type === "boolean") {
    return frame(
      <span className="property-toggle">
        <input
          aria-describedby={describedBy}
          aria-errormessage={hasError ? diagnosticId : undefined}
          aria-label={label}
          aria-invalid={hasError || undefined}
          checked={Boolean(value)}
          onChange={(event) => onChange({ [definition.key]: event.target.checked })}
          type="checkbox"
        />
        <span aria-hidden="true" className="property-toggle__track" />
      </span>,
    );
  }

  if (definition.type === "structured-list") {
    return frame(
      <StructuredListControl
        definition={definition}
        errorMessageId={diagnosticId}
        idPrefix={idPrefix}
        label={label}
        mode={mode}
        onChange={onChange}
        onPreview={onPreview}
        invalid={hasError}
        value={value}
      />,
    );
  }

  if (definition.type === "gradient") {
    return frame(
      <GradientControl
        definition={definition}
        errorMessageId={diagnosticId}
        label={label}
        onChange={(nextValue) => onChange({ [definition.key]: nextValue })}
        invalid={hasError}
        value={value}
      />,
    );
  }

  if (definition.type === "spacing") {
    return frame(
      <SpacingControl
        definition={definition}
        errorMessageId={diagnosticId}
        label={label}
        onChange={(nextValue) => onChange({ [definition.key]: nextValue })}
        invalid={hasError}
        value={value}
      />,
    );
  }

  if (definition.type === "font" || definition.type === "icon") {
    const listId = `${idPrefix}-${definition.key}-options`;
    return frame(
      <div className="property-asset-select">
        <input
          aria-describedby={describedBy}
          aria-errormessage={hasError ? diagnosticId : undefined}
          aria-label={label}
          aria-invalid={hasError || undefined}
          list={listId}
          onChange={(event) => onChange({ [definition.key]: event.target.value })}
          type="search"
          value={String(value)}
        />
        <datalist id={listId}>
          {definition.options.map((option) => <option key={option.value} label={option.label} value={option.value} />)}
        </datalist>
      </div>,
    );
  }

  if (definition.type === "animation-stage") {
    return frame(
      <AnimationStageControl
        definition={definition}
        errorMessageId={diagnosticId}
        label={label}
        onChange={(nextValue) => onChange({ [definition.key]: nextValue })}
        invalid={hasError}
        value={value}
      />,
    );
  }

  return null;
}

/** 中文注释：结构化内容始终以数组条目编辑，所有增删、排序和粘贴操作都只提交结构化快照。 */
function StructuredListControl({
  definition,
  value,
  label,
  idPrefix,
  mode,
  onChange,
  onPreview,
  errorMessageId,
  invalid = false,
}: {
  definition: StructuredListParameterDefinition;
  value: unknown;
  label: string;
  idPrefix: string;
  mode: EditorMode;
  onChange: (params: Record<string, unknown>) => void;
  onPreview?: (params: Record<string, unknown>) => void;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  const items = Array.isArray(value) ? value.map((item) => (isRecord(item) ? item : {})) : [];
  const itemDefaults = getDefaultParams(definition.itemSchema);
  const maxItems = definition.maxItems ?? Number.POSITIVE_INFINITY;
  const minItems = definition.minItems ?? 0;
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);

  const updateItem = (index: number, nextValues: Record<string, unknown>) => {
    onChange({
      [definition.key]: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextValues } : { ...item }),
    });
  };

  const pasteItems = (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: ParameterDefinition,
  ) => {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText.includes("\n") || (field.type !== "text" && field.type !== "multiline-text")) return;
    event.preventDefault();
    const lines = pastedText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    const maxLength = field.maxLength;
    const limitedLines = lines.slice(0, maxItems);
    const nextItems = limitedLines.map((line) => ({
      ...itemDefaults,
      [field.key]: maxLength === undefined ? line : line.slice(0, maxLength),
    }));
    const warnings: string[] = [];
    if (lines.length > maxItems) warnings.push(`粘贴内容超过上限，已保留前 ${maxItems} 项`);
    if (maxLength !== undefined && limitedLines.some((line) => line.length > maxLength)) {
      warnings.push(`字段“${field.label}”已按长度上限保留内容`);
    }
    setPasteWarning(warnings.length > 0 ? warnings.join("；") : null);
    if (nextItems.length > 0) onChange({ [definition.key]: nextItems });
  };

  const previewItem = (index: number, nextValues: Record<string, unknown>) => {
    onPreview?.({
      [definition.key]: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextValues } : { ...item }),
    });
  };

  const addItem = () => {
    if (items.length >= maxItems) return;
    onChange({ [definition.key]: [...items.map((item) => ({ ...item })), { ...itemDefaults }] });
  };

  const removeItem = (index: number) => {
    if (items.length <= minItems) return;
    onChange({ [definition.key]: items.filter((_item, itemIndex) => itemIndex !== index).map((item) => ({ ...item })) });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length || definition.allowReordering === false) return;
    const nextItems = items.map((item) => ({ ...item }));
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    onChange({ [definition.key]: nextItems });
  };

  return (
    <div aria-errormessage={invalid ? errorMessageId : undefined} aria-invalid={invalid || undefined} aria-label={label} className="structured-list-control" role="group">
      <div className="structured-list-control__items">
        {items.map((item, index) => (
          <fieldset className="structured-list-item" key={`${definition.key}-${index}`}>
            <legend>第{index + 1}项</legend>
            <div className="structured-list-item__controls">
              {definition.itemSchema.map((field) => (
                <ParameterControl
                  definition={field}
                  idPrefix={`${idPrefix}-item-${index + 1}`}
                  key={field.key}
                  labelSuffix={`第${index + 1}项`}
                  mode={mode}
                  onChange={(nextValues) => updateItem(index, nextValues)}
                  onPaste={(event) => pasteItems(event, field)}
                  onPreview={(nextValues) => previewItem(index, nextValues)}
                  values={item}
                />
              ))}
            </div>
            <div className="structured-list-item__actions" role="group" aria-label={`第${index + 1}项操作`}>
              {definition.allowReordering === false ? null : (
                <>
                  <button aria-label={`上移第${index + 1}项`} disabled={index === 0} onClick={() => moveItem(index, -1)} type="button">上移</button>
                  <button aria-label={`下移第${index + 1}项`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} type="button">下移</button>
                </>
              )}
              <button aria-label={`删除第${index + 1}项`} disabled={items.length <= minItems} onClick={() => removeItem(index)} type="button">删除</button>
            </div>
          </fieldset>
        ))}
      </div>
      {pasteWarning ? <p className="property-diagnostic property-diagnostic--warning" role="status">{pasteWarning}</p> : null}
      <button className="structured-list-control__add" disabled={items.length >= maxItems} onClick={addItem} type="button">添加条目</button>
    </div>
  );
}

/** 中文注释：渐变编辑器只修改角度和色标对象，保证渲染器读取的值不退化为 CSS 分隔字符串。 */
function GradientControl({
  definition,
  value,
  label,
  onChange,
  errorMessageId,
  invalid = false,
}: {
  definition: GradientParameterDefinition;
  value: unknown;
  label: string;
  onChange: (value: GradientValue) => void;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  const fallback = definition.defaultValue;
  const gradient = isRecord(value) && typeof value.angle === "number" && Array.isArray(value.stops)
    ? value as unknown as GradientValue
    : fallback;
  const stops = gradient.stops.map((stop) => ({ ...stop }));
  const updateStop = (index: number, field: "offset" | "color", nextValue: number | string) => {
    onChange({
      angle: gradient.angle,
      stops: stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, [field]: nextValue } : stop),
    });
  };

  return (
    <div aria-errormessage={invalid ? errorMessageId : undefined} aria-invalid={invalid || undefined} aria-label={label} className="gradient-control" role="group">
      <label>
        <span>角度</span>
        <input
          aria-label={`${label}角度`}
          max={360}
          min={-360}
          onChange={(event) => {
            const nextAngle = parseFiniteNumber(event.target.value);
            if (nextAngle !== undefined) onChange({ angle: nextAngle, stops });
          }}
          step={1}
          type="number"
          value={gradient.angle}
        />
      </label>
      <div className="gradient-control__stops">
        {stops.map((stop, index) => {
          const stopLabel = `${label}第${index + 1}个色标`;
          return (
            <div className="gradient-stop" key={`${stopLabel}-${stop.offset}`}>
              <ColorInput
                label={stopLabel}
                onChange={(nextColor) => updateStop(index, "color", nextColor)}
                value={stop.color}
              />
              <label>
                <span>位置</span>
                <input
                  aria-label={`${stopLabel}位置`}
                  max={1}
                  min={0}
                  onChange={(event) => {
                    const nextOffset = parseFiniteNumber(event.target.value);
                    if (nextOffset !== undefined) updateStop(index, "offset", clamp(nextOffset, 0, 1));
                  }}
                  step={0.01}
                  type="number"
                  value={stop.offset}
                />
              </label>
              <button aria-label={`删除${stopLabel}`} disabled={stops.length <= (definition.minStops ?? 0)} onClick={() => onChange({ angle: gradient.angle, stops: stops.filter((_item, stopIndex) => stopIndex !== index) })} type="button">删除</button>
            </div>
          );
        })}
      </div>
      <button
        aria-label={`添加${label}色标`}
        disabled={definition.maxStops !== undefined && stops.length >= definition.maxStops}
        onClick={() => onChange({ angle: gradient.angle, stops: [...stops, { offset: 1, color: "#ffffff" }] })}
        type="button"
      >
        添加色标
      </button>
    </div>
  );
}

/** 中文注释：间距控件以四边数值保存内外边距，避免调用方解析顺序敏感的简写文本。 */
function SpacingControl({
  definition,
  value,
  label,
  onChange,
  errorMessageId,
  invalid = false,
}: {
  definition: SpacingParameterDefinition;
  value: unknown;
  label: string;
  onChange: (value: { top: number; right: number; bottom: number; left: number }) => void;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  const spacing = isRecord(value) ? value : definition.defaultValue;
  const fields: Array<[keyof typeof definition.defaultValue, string]> = [
    ["top", "上"],
    ["right", "右"],
    ["bottom", "下"],
    ["left", "左"],
  ];
  return (
    <div aria-errormessage={invalid ? errorMessageId : undefined} aria-invalid={invalid || undefined} aria-label={label} className="property-grid property-grid--four" role="group">
      {fields.map(([field, fieldLabel]) => (
        <label key={field}>
          <span>{fieldLabel}</span>
          <input
            aria-label={`${label}${fieldLabel}`}
            aria-errormessage={invalid ? errorMessageId : undefined}
            aria-invalid={invalid || undefined}
            max={definition.max}
            min={definition.min}
            onChange={(event) => {
              const nextValue = parseFiniteNumber(event.target.value);
              if (nextValue === undefined) return;
              onChange({
                top: Number(spacing.top ?? 0),
                right: Number(spacing.right ?? 0),
                bottom: Number(spacing.bottom ?? 0),
                left: Number(spacing.left ?? 0),
                [field]: clamp(nextValue, definition.min, definition.max),
              });
            }}
            step={definition.step}
            type="number"
            value={Number(spacing[field] ?? 0)}
          />
        </label>
      ))}
    </div>
  );
}

/** 中文注释：动画阶段控件只编辑声明的入场、持续和出场字段，不开放任意关键帧。 */
function AnimationStageControl({
  definition,
  value,
  label,
  onChange,
  errorMessageId,
  invalid = false,
}: {
  definition: AnimationStageParameterDefinition;
  value: unknown;
  label: string;
  onChange: (value: Record<string, AnimationPhaseValue>) => void;
  errorMessageId?: string;
  invalid?: boolean;
}) {
  const stageValues = isRecord(value) ? value : {};
  const getDefaultPhase = (stage: "enter" | "sustain" | "exit"): AnimationPhaseValue => definition.defaultValue[stage] ?? {
    durationInFrames: 0,
    delayInFrames: 0,
    direction: "none",
    easing: "linear",
    intensity: 1,
    stagger: 0,
  };
  const updatePhase = (stage: "enter" | "sustain" | "exit", field: keyof AnimationPhaseValue, nextValue: string | number) => {
    const fallback = getDefaultPhase(stage);
    const current = isRecord(stageValues[stage]) ? stageValues[stage] : {};
    const constrainedValue = typeof nextValue === "number" && [
      "durationInFrames",
      "delayInFrames",
      "intensity",
      "stagger",
    ].includes(field)
      ? Math.max(0, nextValue)
      : nextValue;
    onChange({
      ...stageValues,
      [stage]: { ...fallback, ...current, [field]: constrainedValue },
    } as Record<string, AnimationPhaseValue>);
  };

  return (
    <div aria-errormessage={invalid ? errorMessageId : undefined} aria-invalid={invalid || undefined} aria-label={label} className="animation-stage-control" role="group">
      {definition.stages.map((stage) => {
        const fallback = getDefaultPhase(stage);
        const current = isRecord(stageValues[stage]) ? stageValues[stage] : {};
        const phase = { ...fallback, ...current };
        const stageLabel = STAGE_LABELS[stage];
        const options = (base: Array<{ value: string; label: string }>, currentValue: string) => (
          [...base, ...(base.some((option) => option.value === currentValue) ? [] : [{ value: currentValue, label: currentValue }])]
        );
        return (
          <fieldset className="animation-stage" key={stage}>
            <legend>{stageLabel}</legend>
            <div className="property-grid property-grid--two">
              <label>
                <span>时长</span>
                <input aria-label={`${label}${stageLabel}时长`} min={0} onChange={(event) => { const next = parseFiniteNumber(event.target.value); if (next !== undefined) updatePhase(stage, "durationInFrames", next); }} step={1} type="number" value={Number(phase.durationInFrames)} />
              </label>
              <label>
                <span>延迟</span>
                <input aria-label={`${label}${stageLabel}延迟`} min={0} onChange={(event) => { const next = parseFiniteNumber(event.target.value); if (next !== undefined) updatePhase(stage, "delayInFrames", next); }} step={1} type="number" value={Number(phase.delayInFrames)} />
              </label>
              <label>
                <span>方向</span>
                <select aria-label={`${label}${stageLabel}方向`} onChange={(event) => updatePhase(stage, "direction", event.target.value)} value={String(phase.direction)}>
                  {options(DIRECTION_OPTIONS, String(phase.direction)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>缓动</span>
                <select aria-label={`${label}${stageLabel}缓动`} onChange={(event) => updatePhase(stage, "easing", event.target.value)} value={String(phase.easing)}>
                  {options(EASING_OPTIONS, String(phase.easing)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>强度</span>
                <input aria-label={`${label}${stageLabel}强度`} min={0} onChange={(event) => { const next = parseFiniteNumber(event.target.value); if (next !== undefined) updatePhase(stage, "intensity", next); }} step={0.01} type="number" value={Number(phase.intensity)} />
              </label>
              <label>
                <span>交错</span>
                <input aria-label={`${label}${stageLabel}交错`} min={0} onChange={(event) => { const next = parseFiniteNumber(event.target.value); if (next !== undefined) updatePhase(stage, "stagger", next); }} step={1} type="number" value={Number(phase.stagger)} />
              </label>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** 中文注释：高级分组负责展开、折叠和单组重置，参数更新仍由面板统一转发到命令层。 */
function GroupSection({
  group,
  definitions,
  open,
  values,
  diagnostics,
  mode,
  onToggle,
  onReset,
  onChange,
  onPreview,
}: {
  group: ParameterGroup;
  definitions: ReadonlyArray<ParameterDefinition>;
  open: boolean;
  values: Record<string, unknown>;
  diagnostics: PanelDiagnostic[];
  mode: EditorMode;
  onToggle: () => void;
  onReset: () => void;
  onChange: (params: Record<string, unknown>) => void;
  onPreview?: (params: Record<string, unknown>) => void;
}) {
  if (definitions.length === 0) return null;
  const groupLabel = GROUP_LABELS[group];
  const groupId = `parameter-group-${group}`;
  return (
    <section className="parameter-group">
      <div className="parameter-group__heading">
        <button aria-controls={groupId} aria-expanded={open} className="parameter-group__toggle" onClick={onToggle} type="button">{groupLabel}</button>
        <button aria-label={`重置${groupLabel}参数`} className="parameter-group__reset" onClick={onReset} type="button">重置</button>
      </div>
      {open ? (
        <div className="parameter-group__body" id={groupId}>
          {definitions.map((definition) => (
            <ParameterControl
              definition={definition}
              diagnostics={diagnostics.filter((diagnostic) => diagnostic.key === definition.key)}
              idPrefix={`group-${group}`}
              key={definition.key}
              mode={mode}
              onChange={onChange}
              onPreview={onPreview}
              values={values}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 中文注释：属性面板只组织模式、分组和诊断，具体参数值仍通过回调交给编辑器命令层。 */
export function PropertiesPanel({
  project,
  selectedClip,
  paramsSnapshot,
  onPreviewParams,
  onChangeParams,
  onSwitchStartingStyle,
}: PropertiesPanelProps) {
  const [mode, setMode] = useState<EditorMode>("basic");
  const [openGroups, setOpenGroups] = useState<Record<ParameterGroup, boolean>>({
    content: true,
    layout: true,
    appearance: true,
    animation: true,
    behavior: true,
  });

  if (!selectedClip) {
    return (
      <aside aria-label="特效参数面板" className="panel properties-panel">
        <div className="panel-heading"><span className="eyebrow">Inspector</span><h2>特效参数</h2></div>
        <div className="properties-empty"><span className="properties-empty__icon">✦</span><p>选择一个特效片段开始调整</p></div>
      </aside>
    );
  }

  let family: EffectFamilyDefinition;
  try {
    family = getEffectFamily(selectedClip.effectFamilyId, selectedClip.templateVersion);
  } catch {
    return <aside className="panel properties-panel"><div className="panel-heading"><span className="eyebrow">Inspector</span><h2>特效参数</h2></div><p className="error-copy">这个特效与当前目录版本不兼容，请重新添加特效。</p></aside>;
  }

  const styleId = family.startingStyles.find((style) => style.id === selectedClip.startingStyleId)?.id;
  if (!styleId) {
    return <aside className="panel properties-panel"><div className="panel-heading"><span className="eyebrow">Inspector</span><h2>特效参数</h2></div><p className="error-copy">这个特效的起始样式与当前目录版本不兼容，请重新添加特效。</p></aside>;
  }

  const rawParams = paramsSnapshot ?? selectedClip.params;
  const parameters = getPanelParameters(family);
  const normalized = normalizeParameterValuesWithDiagnostics(parameters, rawParams);
  const diagnostics = buildPanelDiagnostics(parameters, rawParams, normalized);
  if (selectedClip.placement?.type === "boundary") {
    diagnostics.push(
      ...getBoundaryTransitionWarnings(project, selectedClip).map((message, index) => ({
        code: `transition_warning_${index}`,
        message,
        severity: "warning" as const,
      })),
    );
  }
  const basicParameters = getBasicParameters(parameters);
  const resetParams = getResetParams(family, styleId, project);
  const values = mode === "basic"
    ? Object.fromEntries(parameters.map((parameter) => {
        const current = normalized.values[parameter.key];
        if (parameter.safety !== "warn-on-overflow" || (parameter.type !== "position" && parameter.type !== "size")) return [parameter.key, current];
        if (parameter.type === "position" && isRecord(current)) {
          const layoutValue = current as Record<string, unknown>;
          return [parameter.key, { x: clamp(Number(layoutValue.x), 0, 1), y: clamp(Number(layoutValue.y), 0, 1) }];
        }
        if (parameter.type === "size" && isRecord(current)) {
          const layoutValue = current as Record<string, unknown>;
          return [parameter.key, { width: clamp(Number(layoutValue.width), 0, 1), height: clamp(Number(layoutValue.height), 0, 1) }];
        }
        return [parameter.key, current];
      }))
    : normalized.values;
  const change = (params: Record<string, unknown>) => onChangeParams?.(selectedClip.id, params);
  const preview = onPreviewParams ? (params: Record<string, unknown>) => onPreviewParams(selectedClip.id, params) : undefined;
  const advanced = mode === "advanced";
  const visibleParameterKeys = new Set(
    (advanced
      ? parameters.filter((parameter) => openGroups[getParameterGroup(parameter)])
      : basicParameters
    ).map((parameter) => parameter.key),
  );
  const globalErrors = diagnostics.filter((diagnostic) => diagnostic.severity === "error" && (!diagnostic.key || !visibleParameterKeys.has(diagnostic.key)));
  const globalWarnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning" && (!diagnostic.key || !visibleParameterKeys.has(diagnostic.key)));
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  const resetGroup = (group: ParameterGroup) => {
    const groupParams = parameters
      .filter((parameter) => getParameterGroup(parameter) === group)
      .reduce<Record<string, unknown>>((result, parameter) => {
        result[parameter.key] = cloneValue(resetParams[parameter.key] ?? parameter.defaultValue);
        return result;
      }, {});
    change(groupParams);
  };

  return (
    <aside aria-label="特效参数面板" className="panel properties-panel">
      <div className="panel-heading">
        <span className="eyebrow">Inspector / {family.category === "transition" ? "转场" : "特效"}</span>
        <h2>特效参数</h2>
        <p className="panel-subtitle">{family.name}</p>
        {family.startingStyles.length > 1 ? (
          <label className="properties-style-select">
            <span>起始样式</span>
            <select aria-label="起始样式" onChange={(event) => onSwitchStartingStyle?.(selectedClip.id, event.target.value)} value={styleId}>
              {family.startingStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
            </select>
          </label>
        ) : null}
        <div aria-label="特效参数编辑模式" className="properties-mode" role="group">
          <span className="properties-mode__label">{advanced ? "高级参数" : "基础参数"}</span>
          <button aria-expanded={advanced} aria-controls="advanced-property-groups" className="properties-mode__toggle" onClick={() => setMode(advanced ? "basic" : "advanced")} type="button">
            {advanced ? "收起高级特效参数" : "显示高级特效参数"}
          </button>
        </div>
      </div>
      {diagnostics.some((diagnostic) => diagnostic.severity === "error") ? (
        <section aria-label="特效参数错误" className="property-diagnostics property-diagnostics--error" role="alert">
          <h3>参数需要修正</h3>
          <p className="property-diagnostic">检测到 {errorCount} 项错误，请查看对应字段。</p>
          <DiagnosticMessages diagnostics={globalErrors} />
        </section>
      ) : null}
      {diagnostics.some((diagnostic) => diagnostic.severity === "warning") ? (
        <section aria-label="特效参数警告" className="property-diagnostics property-diagnostics--warning" role="status">
          <h3>参数提示</h3>
          <p className="property-diagnostic">检测到 {warningCount} 项非阻断提示，请查看对应字段。</p>
          <DiagnosticMessages diagnostics={globalWarnings} />
        </section>
      ) : null}
      <div className="properties-form">
        {!advanced ? (
          <section aria-label="基础特效参数" className="properties-basic">
            {basicParameters.map((definition) => (
              <ParameterControl
                definition={definition}
                diagnostics={diagnostics.filter((diagnostic) => diagnostic.key === definition.key)}
                idPrefix="basic"
                key={definition.key}
                mode="basic"
                onChange={change}
                onPreview={preview}
                values={values}
              />
            ))}
          </section>
        ) : (
          <div className="properties-groups" id="advanced-property-groups">
            {GROUP_ORDER.map((group) => (
              <GroupSection
                definitions={parameters.filter((parameter) => getParameterGroup(parameter) === group)}
                diagnostics={diagnostics}
                group={group}
                key={group}
                mode="advanced"
                onChange={change}
                onPreview={preview}
                onReset={() => resetGroup(group)}
                onToggle={() => setOpenGroups((current) => ({ ...current, [group]: !current[group] }))}
                open={openGroups[group]}
                values={values}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
