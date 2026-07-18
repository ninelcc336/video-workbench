import type { EditProject, EffectClip } from "../../domain/project/model";
import { PreviewPlayer } from "../preview/PreviewPlayer";
import type { MediaSources } from "../../remotion/media";
import { CanvasSelection } from "./CanvasSelection";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

export type PreviewCanvasProps = {
  project: EditProject;
  mediaSources?: MediaSources;
  currentFrame?: number;
  selectedClip?: EffectClip | null;
  paramsSnapshot?: Record<string, unknown>;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
  onFrameChange?: (frame: number) => void;
};

export type PreviewSize = {
  width: number;
  height: number;
};

export type PreviewOrientation = "横屏" | "竖屏" | "方形";

/** 中文注释：方向标签跟随项目画布设置，横屏项目不会再被 UI 默认文案误导成竖屏。 */
export function getPreviewOrientation(
  settings: Pick<EditProject["settings"], "width" | "height">,
): PreviewOrientation {
  if (settings.width === settings.height) return "方形";
  return settings.width > settings.height ? "横屏" : "竖屏";
}

/** 中文注释：按 contain 规则计算预览画布尺寸，确保始终完整显示且不改变项目比例。 */
export function getContainSize(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
): PreviewSize {
  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    !Number.isFinite(contentWidth) ||
    !Number.isFinite(contentHeight) ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
  return {
    width: Math.max(1, Math.floor(contentWidth * scale)),
    height: Math.max(1, Math.floor(contentHeight * scale)),
  };
}

/** 中文注释：外壳比例直接来自项目设置，尺寸测量完成后再覆盖宽高以填满可用区域。 */
export function getPreviewDeviceStyle(
  project: Pick<EditProject, "settings">,
  size?: PreviewSize,
): CSSProperties {
  return {
    aspectRatio: `${project.settings.width} / ${project.settings.height}`,
    ...(size && size.width > 0 && size.height > 0
      ? { width: size.width, height: size.height }
      : {}),
  };
}

function getStageContentSize(stage: HTMLDivElement): PreviewSize {
  const rect = stage.getBoundingClientRect();
  const styles = window.getComputedStyle(stage);
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  return {
    width: Math.max(0, rect.width - horizontalPadding),
    height: Math.max(0, rect.height - verticalPadding),
  };
}

/** 中文注释：监听中间预览区域变化，让窄窗口和宽窗口都重新计算等比画布。 */
function usePreviewStageSize(stageRef: RefObject<HTMLDivElement | null>): PreviewSize | null {
  const [stageSize, setStageSize] = useState<PreviewSize | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = (nextSize = getStageContentSize(stage)) => {
      setStageSize((current) => {
        if (current?.width === nextSize.width && current.height === nextSize.height) return current;
        return nextSize;
      });
    };

    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        update({ width: entry.contentRect.width, height: entry.contentRect.height });
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    const handleResize = () => update();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [stageRef]);

  return stageSize;
}

/** 中文注释：预览画布只把当前项目快照交给 Remotion Player，导出时复用同一组合定义。 */
export function PreviewCanvas({
  project,
  mediaSources = {},
  currentFrame = 0,
  selectedClip = null,
  paramsSnapshot,
  onChangeParams,
  onFrameChange,
}: PreviewCanvasProps) {
  const hasContent = project.videoClips.length > 0 || project.effectClips.length > 0;
  const orientation = getPreviewOrientation(project.settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageSize = usePreviewStageSize(stageRef);
  const deviceSize = stageSize
    ? getContainSize(
      stageSize.width,
      stageSize.height,
      project.settings.width,
      project.settings.height,
    )
    : undefined;

  return (
    <section aria-label="视频预览" className="preview-panel">
      <div className="preview-panel__toolbar">
        <span className="eyebrow">实时预览</span>
        <span aria-label={`画布方向：${orientation}`} className="preview-orientation">{orientation}</span>
        <span className="frame-readout">帧 {currentFrame} / {project.settings.fps}fps</span>
      </div>
      <div className="preview-stage" ref={stageRef}>
      <div className="preview-device" style={getPreviewDeviceStyle(project, deviceSize)}>
        <PreviewPlayer
          currentFrame={currentFrame}
          mediaSources={mediaSources}
          onFrameChange={onFrameChange}
          project={project}
        />
        <CanvasSelection
          onChangeParams={onChangeParams}
          paramsSnapshot={paramsSnapshot}
          project={project}
          selectedClip={selectedClip}
        />
      </div>
        {!hasContent && <div className="preview-empty"><span>◌</span><strong>你的画面会出现在这里</strong><p>从左侧导入视频或添加一个特效模板</p></div>}
      </div>
    </section>
  );
}
