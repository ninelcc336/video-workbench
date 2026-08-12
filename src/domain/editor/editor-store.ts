import type { EditProject } from "../project/model";
import { applyCommandWithResult, type EditorCommand } from "./commands";
import { createHistory } from "./history";

export type EditorListener = (snapshot: EditProject, notices?: readonly string[]) => void;

export type EditorStore = {
  dispatch: (command: EditorCommand) => void;
  getSnapshot: () => EditProject;
  undo: () => void;
  redo: () => void;
  subscribe: (listener: EditorListener) => () => void;
};

/** 中文注释：store 只负责串联命令、历史和订阅，不直接保存文件或调用渲染器。 */
export function createEditorStore(initialProject: EditProject): EditorStore {
  const history = createHistory(initialProject);
  const listeners = new Set<EditorListener>();

  const notify = (notices: readonly string[] = []): void => {
    for (const listener of listeners) {
      listener(history.getSnapshot(), notices);
    }
  };

  return {
    dispatch: (command) => {
      const result = applyCommandWithResult(history.getSnapshot(), command);
      history.push(result.project);
      notify(result.notices);
    },
    getSnapshot: () => history.getSnapshot(),
    undo: () => {
      if (!history.canUndo()) {
        return;
      }
      history.undo();
      notify();
    },
    redo: () => {
      if (!history.canRedo()) {
        return;
      }
      history.redo();
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
