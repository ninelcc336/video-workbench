import type { EditProject } from "../project/model";
import { applyCommand, type EditorCommand } from "./commands";
import { createHistory } from "./history";

export type EditorListener = (snapshot: EditProject) => void;

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

  const notify = (): void => {
    for (const listener of listeners) {
      listener(history.getSnapshot());
    }
  };

  return {
    dispatch: (command) => {
      const nextSnapshot = applyCommand(history.getSnapshot(), command);
      history.push(nextSnapshot);
      notify();
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
