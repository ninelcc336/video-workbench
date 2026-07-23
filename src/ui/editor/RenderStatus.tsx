import type { RenderJobSnapshot } from "../../server/render/render-job";

export type RenderStatusProps = {
  snapshot: RenderJobSnapshot | null;
  onCancel?: () => void;
  onRetry?: () => void;
  resultUrl?: string;
  onDismiss?: () => void;
};

const statusLabels: Record<RenderJobSnapshot["status"], string> = {
  preparing: "准备中",
  rendering: "渲染中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const statusDescriptions: Record<RenderJobSnapshot["status"], string> = {
  preparing: "正在整理视频工作区快照和导出资源。",
  rendering: "正在生成 MP4 文件，你可以继续编辑视频工作区。",
  completed: "MP4 已生成并保存在此视频工作区的本地导出库中。",
  failed: "导出未完成；可以重试，当前视频工作区内容不会受影响。",
  cancelled: "导出任务已停止；可以在准备好后重新开始。",
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

/** 中文注释：状态图标只用于快速识别，完整状态文字始终保留给屏幕阅读器和普通阅读场景。 */
function getStatusSymbol(status: RenderJobSnapshot["status"]): string {
  if (status === "completed") return "✓";
  if (status === "failed") return "!";
  if (status === "cancelled") return "–";
  return "•";
}

/** 中文注释：渲染状态组件不发起请求，只消费轮询得到的任务快照并提供相应操作。 */
export function RenderStatus({ snapshot, onCancel, onRetry, resultUrl, onDismiss }: RenderStatusProps) {
  if (!snapshot) return null;

  const canCancel = snapshot.status === "preparing" || snapshot.status === "rendering";
  const canRetry = snapshot.status === "failed" || snapshot.status === "cancelled";
  const exportFileName = getExportFileName(snapshot.outputPath);
  const exportUrl = resultUrl ?? snapshot.outputPath;
  const statusName = statusLabels[snapshot.status];

  return (
    <section aria-label="视频渲染状态" className={`render-status-panel render-status-panel--${snapshot.status}`}>
      <div aria-atomic="true" aria-live={snapshot.status === "failed" ? "assertive" : "polite"} className="render-status-panel__summary" role="status">
        <span aria-hidden="true" className="render-status-panel__mark">{getStatusSymbol(snapshot.status)}</span>
        <div>
          <strong>{snapshot.status === "completed" ? "视频已导出到本地导出库" : `导出${statusName}`}</strong>
          <p>渲染阶段：{stageLabel(snapshot.status)} · {statusDescriptions[snapshot.status]}</p>
        </div>
        {snapshot.status === "completed" && onDismiss ? <button aria-label="关闭导出提示" className="render-status-panel__dismiss" onClick={onDismiss} type="button">×</button> : null}
      </div>
      {snapshot.error ? <p className="render-status-panel__error" role="alert">错误摘要：{snapshot.error.message}</p> : null}
      {snapshot.status === "completed" ? (
        <div className="render-status-panel__result">
          <p>文件：{exportFileName}</p>
          {snapshot.file ? <p>文件大小：{Math.max(1, Math.round(snapshot.file.sizeBytes / 1024))} KB　生成时间：{new Date(snapshot.file.createdAt).toLocaleString("zh-CN")}</p> : null}
          <div className="render-status-panel__actions">
            <a href={exportUrl} rel="noreferrer" target="_blank">在浏览器中打开</a>
          </div>
          <p className="render-status-panel__local-path">本地文件：<code>{snapshot.outputPath}</code></p>
          <p className="render-status-panel__hint">“在浏览器中打开”会新开本地服务地址用于查看结果。</p>
        </div>
      ) : null}
      {canRetry ? <div className="render-status-panel__actions"><button className="render-status-panel__retry" onClick={onRetry} type="button">重试导出</button></div> : null}
      {canCancel ? <div className="render-status-panel__actions"><button className="render-status-panel__cancel" onClick={onCancel} type="button">取消渲染</button></div> : null}
    </section>
  );
}
