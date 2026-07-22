import type { RenderJobSnapshot } from "../../server/render/render-job";

export type RenderStatusProps = {
  snapshot: RenderJobSnapshot | null;
  onCancel?: () => void;
  onRetry?: () => void;
  resultUrl?: string;
  downloadUrl?: string;
};

const statusLabels: Record<RenderJobSnapshot["status"], string> = {
  preparing: "准备中",
  rendering: "渲染中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

/** 中文注释：失败任务仍归属于渲染阶段，用户需要看到阶段和可复制的错误摘要。 */
function stageLabel(status: RenderJobSnapshot["status"]): string {
  if (status === "failed") return "渲染中";
  return statusLabels[status];
}

/** 中文注释：导出结果同时保留完整本地路径和简洁文件名，便于用户定位文件与阅读按钮文案。 */
function getExportFileName(outputPath: string): string {
  return outputPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? "export.mp4";
}

/** 中文注释：渲染状态组件不发起请求，只消费轮询得到的任务快照。 */
export function RenderStatus({ snapshot, onCancel, onRetry, resultUrl, downloadUrl }: RenderStatusProps) {
  if (!snapshot) return null;

  const canCancel = snapshot.status === "preparing" || snapshot.status === "rendering";
  const exportFileName = getExportFileName(snapshot.outputPath);
  const exportUrl = resultUrl ?? snapshot.outputPath;
  const resolvedDownloadUrl = downloadUrl ?? exportUrl;
  return (
    <section aria-label="视频渲染状态" className="render-status-panel">
      <p role="status">
        渲染状态：{statusLabels[snapshot.status]}　渲染阶段：{stageLabel(snapshot.status)}
      </p>
      {snapshot.error ? <p role="alert">错误摘要：{snapshot.error.message}</p> : null}
      {snapshot.status === "completed" ? (
        <div className="render-status-panel__result">
          <div className="render-status-panel__result-heading">
            <span aria-hidden="true" className="render-status-panel__success-mark">✓</span>
            <div><strong>视频已导出到本地导出库</strong><span>文件：{exportFileName}</span></div>
          </div>
          {snapshot.file ? <p>文件大小：{Math.max(1, Math.round(snapshot.file.sizeBytes / 1024))} KB　生成时间：{new Date(snapshot.file.createdAt).toLocaleString("zh-CN")}</p> : null}
          <div className="render-status-panel__actions">
            <a className="render-status-panel__download" href={resolvedDownloadUrl}>下载 MP4</a>
            <a href={exportUrl} rel="noreferrer" target="_blank">在浏览器中打开</a>
          </div>
          <p className="render-status-panel__local-path">本地文件：<code>{snapshot.outputPath}</code></p>
          <p className="render-status-panel__hint">“在浏览器中打开”会新开本地服务地址；“下载 MP4”会保存到浏览器设置的默认下载位置。</p>
        </div>
      ) : null}
      {snapshot.status === "failed" ? <button onClick={onRetry} type="button">重试导出</button> : null}
      {canCancel ? <button onClick={onCancel} type="button">取消渲染</button> : null}
    </section>
  );
}
