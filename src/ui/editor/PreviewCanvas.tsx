import type { EditProject, EffectClip } from "../../domain/project/model";
import { PreviewPlayer } from "../preview/PreviewPlayer";
import type { MediaSources } from "../../remotion/media";
import { CanvasSelection } from "./CanvasSelection";

export type PreviewCanvasProps = {
  project: EditProject;
  mediaSources?: MediaSources;
  currentFrame?: number;
  selectedClip?: EffectClip | null;
  paramsSnapshot?: Record<string, unknown>;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
};

/** 中文注释：预览画布只把当前项目快照交给 Remotion Player，导出时复用同一组合定义。 */
export function PreviewCanvas({
  project,
  mediaSources = {},
  currentFrame = 0,
  selectedClip = null,
  paramsSnapshot,
  onChangeParams,
}: PreviewCanvasProps) {
  const hasContent = project.videoClips.length > 0 || project.effectClips.length > 0;
  return (
    <section aria-label="视频预览" className="preview-panel">
      <div className="preview-panel__toolbar"><span className="eyebrow">实时预览</span><span className="frame-readout">帧 {currentFrame} / {project.settings.fps}fps</span></div>
      <div className="preview-stage">
      <div className="preview-device">
        <PreviewPlayer mediaSources={mediaSources} project={project} />
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
