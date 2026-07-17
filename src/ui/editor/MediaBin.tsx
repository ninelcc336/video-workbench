import { useRef } from "react";
import type { EditProject } from "../../domain/project/model";

export type MediaBinProps = {
  project: EditProject;
  onImportMedia?: (file: File) => void;
  missingMediaIds?: string[];
};

/** 中文注释：素材库只负责选择本地文件并展示已加入项目的素材，不直接调用文件系统。 */
export function MediaBin({ project, onImportMedia, missingMediaIds = [] }: MediaBinProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
      <button className="upload-button" onClick={() => inputRef.current?.click()} type="button">
        <span>＋</span> 导入视频素材
      </button>
      <div className="media-list">
        {project.videoClips.map((clip, index) => (
          <div className={`media-item${missingMediaIds.includes(clip.mediaId) ? " media-item--missing" : ""}`} key={clip.id}>
            <span className="media-item__index">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>视频片段 {index + 1}</strong><small>{missingMediaIds.includes(clip.mediaId) ? "素材缺失" : `${(clip.durationInFrames / project.settings.fps).toFixed(1)} 秒`}</small></div>
          </div>
        ))}
        {missingMediaIds.length > 0 && <p role="status" className="editor-notice">素材缺失，修复后才能导出视频。</p>}
        {project.videoClips.length === 0 && <p className="muted-copy">先导入一段视频，开始你的第一个编辑项目。</p>}
      </div>
    </section>
  );
}
