import type { RenderJobSnapshot } from "../../server/render/render-job";

export type RenderStatusProps = {
  snapshot: RenderJobSnapshot | null;
  onCancel?: () => void;
  onRetry?: () => void;
  resultUrl?: string;
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

/** 中文注释：渲染状态组件不发起请求，只消费轮询得到的任务快照。 */
export function RenderStatus({ snapshot, onCancel, onRetry, resultUrl }: RenderStatusProps) {
  if (!snapshot) return null;

  const canCancel = snapshot.status === "preparing" || snapshot.status === "rendering";
  return (
    <section aria-label="视频渲染状态" className="render-status-panel">
      <p role="status">
        渲染状态：{statusLabels[snapshot.status]}　渲染阶段：{stageLabel(snapshot.status)}
      </p>
      {snapshot.error ? <p role="alert">错误摘要：{snapshot.error.message}</p> : null}
      {snapshot.status === "completed" ? (
        <>
          {snapshot.file ? <p>文件大小：{Math.max(1, Math.round(snapshot.file.sizeBytes / 1024))} KB　生成时间：{new Date(snapshot.file.createdAt).toLocaleString("zh-CN")}</p> : null}
          <a href={resultUrl ?? snapshot.outputPath} rel="noreferrer" target="_blank">打开导出文件</a>
        </>
      ) : null}
      {snapshot.status === "failed" ? <button onClick={onRetry} type="button">重试导出</button> : null}
      {canCancel ? <button onClick={onCancel} type="button">取消渲染</button> : null}
    </section>
  );
}
