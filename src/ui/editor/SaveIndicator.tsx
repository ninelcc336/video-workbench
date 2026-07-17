import { useEffect, useState } from "react";
import type { EditProject } from "../../domain/project/model";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type AutosaveState = {
  status: AutosaveStatus;
  error: string | null;
  lastSavedAt: Date | null;
};

export type AutosaveController = {
  schedule: (project: EditProject) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  getState: () => AutosaveState;
  subscribe: (listener: (state: AutosaveState) => void) => () => void;
};

export type SaveProject = (project: EditProject) => Promise<void>;

/** 中文注释：自动保存只接收编辑器快照，由页面把本地工作区保存适配器注入进来。 */
export function createAutosaveController(
  save: SaveProject,
  debounceMs = 500,
): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingProject: EditProject | null = null;
  let state: AutosaveState = { status: "idle", error: null, lastSavedAt: null };
  const listeners = new Set<(nextState: AutosaveState) => void>();

  const notify = (): void => {
    const snapshot = { ...state };
    for (const listener of listeners) listener(snapshot);
  };

  const setState = (nextState: AutosaveState): void => {
    state = nextState;
    notify();
  };

  const performSave = async (): Promise<void> => {
    if (!pendingProject) return;
    const project = pendingProject;
    pendingProject = null;
    setState({ status: "saving", error: null, lastSavedAt: state.lastSavedAt });
    try {
      await save(structuredClone(project));
      setState({ status: "saved", error: null, lastSavedAt: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setState({
        status: "error",
        error: `自动保存失败：${message}`,
        lastSavedAt: state.lastSavedAt,
      });
    }
  };

  const schedule = (project: EditProject): void => {
    pendingProject = structuredClone(project);
    if (timer) clearTimeout(timer);
    setState({ status: "saving", error: null, lastSavedAt: state.lastSavedAt });
    timer = setTimeout(() => {
      timer = null;
      void performSave();
    }, Math.max(0, debounceMs));
  };

  return {
    schedule,
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await performSave();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingProject = null;
    },
    getState: () => ({ ...state }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SaveIndicatorProps = {
  state: AutosaveState;
};

function formatSavedTime(value: Date | null): string {
  if (!value) return "";
  return value.toLocaleString("zh-CN", { hour12: false });
}

/** 中文注释：保存指示器只展示状态，不直接触碰文件系统或编辑器快照。 */
export function SaveIndicator({ state }: SaveIndicatorProps) {
  const label = {
    idle: "本地编辑中",
    saving: "自动保存中…",
    saved: "已自动保存",
    error: "自动保存失败",
  }[state.status];
  const suffix = state.status === "saved" ? ` · ${formatSavedTime(state.lastSavedAt)}` : "";

  return (
    <span aria-label="保存状态" className={`save-state save-state--${state.status}`} role="status">
      ● {label}{suffix}
      {state.error ? `：${state.error.replace(/^自动保存失败：/, "")}` : ""}
    </span>
  );
}

/** 中文注释：提供一个可选的订阅包装，便于页面接入控制器而不重复管理状态。 */
export function useAutosaveState(controller: AutosaveController): AutosaveState {
  const [state, setState] = useState(controller.getState);
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}
