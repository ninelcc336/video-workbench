import type { ChangeEvent } from "react";
import type { EditProject, EffectClip } from "../../domain/project/model";
import { getTemplate, normalizeParams } from "../../domain/templates/registry";
import type { ParameterDefinition } from "../../domain/templates/types";

export type PropertiesPanelProps = {
  project: EditProject;
  selectedClip: EffectClip | null;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
};

function updateObjectParam(
  selectedClip: EffectClip,
  key: string,
  field: string,
  value: number,
): Record<string, unknown> {
  const current = selectedClip.params[key];
  const objectValue = current && typeof current === "object" ? current : {};
  return {
    [key]: { ...(objectValue as Record<string, unknown>), [field]: value },
  };
}

function ParameterControl({
  definition,
  selectedClip,
  values,
  onChange,
}: {
  definition: ParameterDefinition;
  selectedClip: EffectClip;
  values: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const value = values[definition.key];

  const update = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const rawValue = event.target.value;
    if (definition.type === "number") {
      onChange({ [definition.key]: Number(rawValue) });
    } else if (definition.type === "boolean") {
      onChange({ [definition.key]: event.target instanceof HTMLInputElement && event.target.checked });
    } else {
      onChange({ [definition.key]: rawValue });
    }
  };

  if (definition.type === "position" || definition.type === "size") {
    const isPosition = definition.type === "position";
    const objectValue = (value ?? definition.defaultValue) as { x?: number; y?: number; width?: number; height?: number };
    const firstKey = isPosition ? "x" : "width";
    const secondKey = isPosition ? "y" : "height";
    const firstLabel = isPosition ? "X" : "宽度";
    const secondLabel = isPosition ? "Y" : "高度";
    return (
      <fieldset className="property-fieldset">
        <legend>{definition.label}</legend>
        <div className="property-grid property-grid--two">
          <label>
            <span>{firstLabel}</span>
            <input
              aria-label={`${definition.label}${firstLabel}`}
              max={1}
              min={0}
              onChange={(event) => onChange(updateObjectParam(selectedClip, definition.key, firstKey, Number(event.target.value)))}
              step={0.01}
              type="number"
              value={Number(objectValue[firstKey as keyof typeof objectValue] ?? 0)}
            />
          </label>
          <label>
            <span>{secondLabel}</span>
            <input
              aria-label={`${definition.label}${secondLabel}`}
              max={1}
              min={0}
              onChange={(event) => onChange(updateObjectParam(selectedClip, definition.key, secondKey, Number(event.target.value)))}
              step={0.01}
              type="number"
              value={Number(objectValue[secondKey as keyof typeof objectValue] ?? 0)}
            />
          </label>
        </div>
      </fieldset>
    );
  }

  return (
    <label className="property-control">
      <span>{definition.label}</span>
      {definition.type === "text" && (
        <input maxLength={definition.maxLength} onChange={update} type="text" value={String(value ?? "")} />
      )}
      {definition.type === "color" && (
        <span className="color-input">
          <input aria-label={definition.label} onChange={update} type="color" value={String(value ?? definition.defaultValue)} />
          <code>{String(value ?? definition.defaultValue)}</code>
        </span>
      )}
      {definition.type === "number" && (
        <input
          aria-label={definition.label}
          max={definition.max}
          min={definition.min}
          onChange={update}
          step={definition.step}
          type="number"
          value={Number(value ?? definition.defaultValue)}
        />
      )}
      {definition.type === "select" && (
        <select aria-label={definition.label} onChange={update} value={String(value ?? definition.defaultValue)}>
          {definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {definition.type === "boolean" && (
        <input aria-label={definition.label} checked={Boolean(value)} onChange={update} type="checkbox" />
      )}
    </label>
  );
}

/** 中文注释：属性面板根据模板声明生成控件，改动通过回调交给编辑器命令层。 */
export function PropertiesPanel({ selectedClip, onChangeParams }: PropertiesPanelProps) {
  if (!selectedClip) {
    return (
      <aside aria-label="特效参数面板" className="panel properties-panel">
        <div className="panel-heading"><span className="eyebrow">Inspector</span><h2>特效参数</h2></div>
        <div className="properties-empty"><span className="properties-empty__icon">✦</span><p>选择一个特效片段开始调整</p></div>
      </aside>
    );
  }

  let template;
  try {
    template = getTemplate(selectedClip.templateId, selectedClip.templateVersion);
  } catch {
    return <aside className="panel properties-panel"><div className="panel-heading"><span className="eyebrow">Inspector</span><h2>特效参数</h2></div><p className="error-copy">找不到这个特效模板，请重新选择。</p></aside>;
  }
  const values = normalizeParams(template, selectedClip.params);
  const change = (params: Record<string, unknown>) => onChangeParams?.(selectedClip.id, params);

  return (
    <aside aria-label="特效参数面板" className="panel properties-panel">
      <div className="panel-heading">
        <span className="eyebrow">Inspector / {template.category === "transition" ? "转场" : "特效"}</span>
        <h2>特效参数</h2>
        <p className="panel-subtitle">{template.name}</p>
      </div>
      <div className="properties-form">
        {template.parameters.map((definition) => (
          <ParameterControl definition={definition} key={definition.key} onChange={change} selectedClip={selectedClip} values={values} />
        ))}
      </div>
    </aside>
  );
}
