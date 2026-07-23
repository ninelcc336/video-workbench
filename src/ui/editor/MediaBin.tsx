import { useRef } from "react";
import type { EditProject } from "../../domain/project/model";
import type { MediaAsset } from "../../server/workspace/media-repository";

export type MediaBinProps = {
  project: EditProject;
  onImportMedia?: (file: File) => void;
  missingMediaIds?: string[];
  mediaAssets?: MediaAsset[];
  onRelinkMedia?: (mediaId: string, file: File) => void;
  onRenameMedia?: (mediaId: string, name: string) => void;
  onDeleteMedia?: (mediaId: string) => void;
  relinkedMediaId?: string | null;
  onUndoRelinkMedia?: (mediaId: string) => void;
};

/** 中文注释：素材库只负责选择本地文件并展示已加入当前工作区的素材，不直接调用文件系统。 */
export function MediaBin({ project, onImportMedia, missingMediaIds = [], mediaAssets = [], onRelinkMedia, onRenameMedia, onDeleteMedia, relinkedMediaId, onUndoRelinkMedia }: MediaBinProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const relinkMediaId = useRef<string | null>(null);

  /** 中文注释：被当前时间轴引用的素材让服务端返回明确的保护提示，不显示“未被引用”的误导性确认文案。 */
  const requestDeleteMedia = (mediaId: string) => {
    if (project.videoClips.some((clip) => clip.mediaId === mediaId)) {
      onDeleteMedia?.(mediaId);
      return;
    }
    if (window.confirm("删除未被引用的素材？")) onDeleteMedia?.(mediaId);
  };

  return (
    <section className="library-section media-bin">
      <div className="library-section__heading"><div><span className="eyebrow">01 / 素材</span><h2>素材库</h2></div><span className="count-badge">{project.videoClips.length}</span></div>
      <input
        accept="video/*"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportMedia?.(file);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <input
        accept="video/*"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const mediaId = relinkMediaId.current;
          if (file && mediaId && window.confirm("重新关联会替换当前素材文件，可能带来内容或时长变化，确定继续吗？")) onRelinkMedia?.(mediaId, file);
          event.target.value = "";
        }}
        ref={relinkInputRef}
        type="file"
      />
      <button className="upload-button" onClick={() => inputRef.current?.click()} type="button">
        <span>＋</span> 导入视频素材
      </button>
      <div className="media-list">
        {project.videoClips.map((clip, index) => (
          <div className={`media-item${missingMediaIds.includes(clip.mediaId) ? " media-item--missing" : ""}`} key={clip.id}>
            <span className="media-item__index">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{mediaAssets.find((asset) => asset.id === clip.mediaId)?.originalName ?? `视频片段 ${index + 1}`}</strong><small>{missingMediaIds.includes(clip.mediaId) ? "素材缺失" : (() => { const asset = mediaAssets.find((item) => item.id === clip.mediaId); return asset?.durationInSeconds ? `${asset.durationInSeconds.toFixed(1)} 秒 · ${asset.width}×${asset.height} · ${asset.fps ?? 30}fps` : `${(clip.durationInFrames / project.settings.fps).toFixed(1)} 秒`; })()}</small>{missingMediaIds.includes(clip.mediaId) && <button type="button" onClick={() => { relinkMediaId.current = clip.mediaId; relinkInputRef.current?.click(); }}>重新关联</button>}</div>
          </div>
        ))}
        {missingMediaIds.length > 0 && <p role="status" className="editor-notice">素材缺失，修复后才能导出视频。</p>}
        {project.videoClips.length === 0 && <p className="muted-copy">先导入一段视频，开始制作当前视频工作区。</p>}
      </div>
      {mediaAssets.length > 0 ? <section aria-label="工作区素材" className="media-list"><h3>工作区素材</h3>{mediaAssets.map((asset) => <div className="media-item" key={asset.id}><div><strong>{asset.originalName}</strong><small>{asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : "大小未知"}</small></div><button type="button" onClick={() => { const name = window.prompt("新的素材名称", asset.originalName); if (name?.trim()) onRenameMedia?.(asset.id, name.trim()); }}>重命名</button><button type="button" onClick={() => requestDeleteMedia(asset.id)}>移除</button></div>)}</section> : null}
      {relinkedMediaId ? <p role="status" className="editor-notice">素材已重新关联。<button type="button" onClick={() => onUndoRelinkMedia?.(relinkedMediaId)}>撤销重新关联</button></p> : null}
    </section>
  );
}
