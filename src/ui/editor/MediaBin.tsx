import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import type { EditProject } from "../../domain/project/model";
import type { MediaAsset } from "../../server/workspace/media-repository";

export type MediaBinProps = {
  project: EditProject;
  onImportMedia?: (file: File) => void | Promise<void>;
  missingMediaIds?: string[];
  mediaAssets?: MediaAsset[];
  onRelinkMedia?: (mediaId: string, file: File) => void | Promise<void>;
  onRenameMedia?: (mediaId: string, name: string) => void | Promise<void>;
  onDeleteMedia?: (mediaId: string) => void | Promise<void>;
  relinkedMediaId?: string | null;
  onUndoRelinkMedia?: (mediaId: string) => void | Promise<void>;
};

type MediaTarget = Pick<MediaAsset, "id" | "originalName">;

/** 中文注释：把服务端或浏览器返回的异常转换为素材库内可见的操作结果。 */
function getMediaOperationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 中文注释：素材库只负责选择本地文件并展示已加入当前工作区的素材，不直接调用文件系统。 */
export function MediaBin({ project, onImportMedia, missingMediaIds = [], mediaAssets = [], onRelinkMedia, onRenameMedia, onDeleteMedia, relinkedMediaId, onUndoRelinkMedia }: MediaBinProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const [renameAsset, setRenameAsset] = useState<MediaAsset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<MediaAsset | null>(null);
  const [relinkAsset, setRelinkAsset] = useState<MediaTarget | null>(null);
  const [pendingRelinkAsset, setPendingRelinkAsset] = useState<MediaTarget | null>(null);
  const [assetName, setAssetName] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** 中文注释：打开重命名表单时复制展示名，取消或失败都不会修改当前素材。 */
  const requestRename = (asset: MediaAsset) => {
    setOperationError(null);
    setAssetName(asset.originalName);
    setRenameAsset(asset);
  };

  /** 中文注释：重命名仅提交用户可见名称，稳定 mediaId 和当前时间轴引用不发生变化。 */
  const submitRename = async () => {
    const nextName = assetName.trim();
    if (!renameAsset || !nextName) {
      setOperationError("请输入素材名称");
      return;
    }
    setIsSubmitting(true);
    setOperationError(null);
    try {
      await onRenameMedia?.(renameAsset.id, nextName);
      setRenameAsset(null);
      setAssetName("");
    } catch (error) {
      setOperationError(getMediaOperationError(error, "素材重命名失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 中文注释：删除确认覆盖已引用和未引用素材，服务端继续作为工作区引用保护的唯一裁决者。 */
  const confirmDelete = async () => {
    if (!deleteAsset) return;
    setIsSubmitting(true);
    setOperationError(null);
    try {
      await onDeleteMedia?.(deleteAsset.id);
      setDeleteAsset(null);
    } catch (error) {
      setOperationError(getMediaOperationError(error, "素材移除失败"));
      setDeleteAsset(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 中文注释：用户确认重新关联后才打开系统文件选择器；选择器取消不会触发任何素材改动。 */
  const confirmRelink = () => {
    if (!relinkAsset) return;
    setPendingRelinkAsset(relinkAsset);
    setRelinkAsset(null);
    relinkInputRef.current?.click();
  };

  /** 中文注释：系统文件选择器返回文件后沿用稳定素材 ID 上传替换，不调整时间轴或特效布局。 */
  const selectRelinkFile = async (file: File) => {
    const asset = pendingRelinkAsset;
    setPendingRelinkAsset(null);
    if (!asset) return;
    setIsSubmitting(true);
    setOperationError(null);
    try {
      await onRelinkMedia?.(asset.id, file);
    } catch (error) {
      setOperationError(getMediaOperationError(error, "重新关联素材失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 中文注释：当前时间轴引用仅用于解释删除风险，是否允许删除仍交由服务端按当前工作区校验。 */
  const isReferenced = (mediaId: string) => project.videoClips.some((clip) => clip.mediaId === mediaId);

  return (
    <section className="library-section media-bin">
      <div className="library-section__heading"><div><span className="eyebrow">01 / 素材</span><h2>素材库</h2></div><span className="count-badge">{project.videoClips.length}</span></div>
      <input
        accept="video/*"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onImportMedia?.(file);
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
          if (file) void selectRelinkFile(file);
          event.target.value = "";
        }}
        ref={relinkInputRef}
        type="file"
      />
      <button className="upload-button" onClick={() => inputRef.current?.click()} type="button">
        <span>＋</span> 导入视频素材
      </button>
      <div className="media-list">
        {project.videoClips.map((clip, index) => {
          const asset = mediaAssets.find((item) => item.id === clip.mediaId);
          const isMissing = missingMediaIds.includes(clip.mediaId);
          const relinkTarget: MediaTarget = asset ?? { id: clip.mediaId, originalName: `视频片段 ${index + 1}` };
          return (
            <div className={`media-item${isMissing ? " media-item--missing" : ""}`} key={clip.id}>
              <span className="media-item__index">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{asset?.originalName ?? `视频片段 ${index + 1}`}</strong><small>{isMissing ? "素材缺失" : asset?.durationInSeconds ? `${asset.durationInSeconds.toFixed(1)} 秒 · ${asset.width}×${asset.height} · ${asset.fps ?? 30}fps` : `${(clip.durationInFrames / project.settings.fps).toFixed(1)} 秒`}</small>{isMissing ? <button type="button" onClick={() => { setOperationError(null); setRelinkAsset(relinkTarget); }}>重新关联</button> : null}</div>
            </div>
          );
        })}
        {missingMediaIds.length > 0 && <p role="status" className="editor-notice">素材缺失，修复后才能导出视频。</p>}
        {project.videoClips.length === 0 && <p className="muted-copy">先导入一段视频，开始制作当前视频工作区。</p>}
      </div>
      {mediaAssets.length > 0 ? <section aria-label="工作区素材" className="media-list"><h3>工作区素材</h3>{mediaAssets.map((asset) => <div className="media-item" key={asset.id}><div><strong>{asset.originalName}</strong><small>{asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : "大小未知"}</small></div><div className="media-item__actions"><button type="button" onClick={() => requestRename(asset)}>重命名</button><button className="media-item__remove" type="button" onClick={() => { setOperationError(null); setDeleteAsset(asset); }}>移除</button></div></div>)}</section> : null}
      {operationError ? <p className="media-bin__error" role="alert">{operationError}</p> : null}
      {relinkedMediaId ? <p role="status" className="editor-notice">素材已重新关联。<button type="button" onClick={() => void onUndoRelinkMedia?.(relinkedMediaId)}>撤销重新关联</button></p> : null}

      <Dialog.Root onOpenChange={(open) => { if (!open) { setRenameAsset(null); setOperationError(null); } }} open={renameAsset !== null}>
        <Dialog.Portal>
          <Dialog.Overlay className="reset-dialog__overlay" />
          <Dialog.Content aria-describedby="media-rename-description" className="workspace-dialog__content">
            <div className="workspace-dialog__heading"><div><p className="reset-dialog__eyebrow">工作区素材</p><Dialog.Title>重命名视频素材</Dialog.Title></div><Dialog.Close aria-label="关闭素材重命名" className="workspace-dialog__close" type="button">×</Dialog.Close></div>
            <Dialog.Description id="media-rename-description">此操作只改变当前视频工作区中的素材展示名称，不会改变时间轴引用。</Dialog.Description>
            <label className="workspace-dialog__field">素材名称<input aria-label="素材名称" disabled={isSubmitting} onChange={(event) => setAssetName(event.target.value)} value={assetName} /></label>
            {operationError ? <p className="workspace-dialog__error" role="alert">{operationError}</p> : null}
            <div className="workspace-dialog__actions"><Dialog.Close asChild><button className="reset-dialog__cancel" disabled={isSubmitting} type="button">取消</button></Dialog.Close><button className="reset-dialog__confirm" disabled={isSubmitting} onClick={() => void submitRename()} type="button">{isSubmitting ? "正在保存…" : "保存名称"}</button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root onOpenChange={(open) => { if (!open) setRelinkAsset(null); }} open={relinkAsset !== null}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="reset-dialog__overlay" />
          <AlertDialog.Content className="reset-dialog__content">
            <div aria-hidden="true" className="reset-dialog__signal">↺</div>
            <div className="reset-dialog__copy"><p className="reset-dialog__eyebrow">重新关联素材</p><AlertDialog.Title>替换“{relinkAsset?.originalName}”的文件？</AlertDialog.Title><AlertDialog.Description>请在下一步选择同一内容的视频文件。时间轴和特效布局会保留，但内容或时长变化可能影响最终导出。</AlertDialog.Description></div>
            <div className="reset-dialog__actions"><AlertDialog.Cancel asChild><button className="reset-dialog__cancel" disabled={isSubmitting} type="button">取消</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="reset-dialog__confirm" disabled={isSubmitting} onClick={confirmRelink} type="button">选择替换文件</button></AlertDialog.Action></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root onOpenChange={(open) => { if (!open) setDeleteAsset(null); }} open={deleteAsset !== null}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="reset-dialog__overlay" />
          <AlertDialog.Content className="reset-dialog__content">
            <div aria-hidden="true" className="reset-dialog__signal">!</div>
            <div className="reset-dialog__copy"><p className="reset-dialog__eyebrow">危险操作</p><AlertDialog.Title>移除“{deleteAsset?.originalName}”？</AlertDialog.Title><AlertDialog.Description>{deleteAsset && isReferenced(deleteAsset.id) ? "该素材仍被当前时间轴引用。确认后会请求移除，服务端将保护仍在使用的素材。" : "该素材将从当前视频工作区永久移除，其他工作区不会受到影响。"}</AlertDialog.Description></div>
            <div className="reset-dialog__actions"><AlertDialog.Cancel asChild><button className="reset-dialog__cancel" disabled={isSubmitting} type="button">取消</button></AlertDialog.Cancel><button className="workspace-dialog__danger" disabled={isSubmitting} onClick={() => void confirmDelete()} type="button">{isSubmitting ? "正在移除…" : "确认移除"}</button></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
