import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "frame-flow.theme-mode";
const ThemeContext = createContext<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>({
  mode: "dark",
  setMode: () => undefined,
});

/** 中文注释：仅接受深浅两种主题值，旧版“跟随系统”偏好会安全迁移为默认深色。 */
function readStoredThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** 中文注释：主题提供器只维护深浅界面偏好，不触碰任何视频工作区或编辑器快照。 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(readStoredThemeMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // 中文注释：隐私模式或受限环境不能持久化时，当前会话仍可正常切换主题。
    }
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 中文注释：主题钩子供启动页和编辑器顶栏共享同一份应用级偏好。 */
export function useTheme() {
  return useContext(ThemeContext);
}

/** 中文注释：月亮与太阳图标直观表达当前主题，点击后切换至相反的界面主题。 */
function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "dark") {
    return <svg aria-hidden="true" className="theme-toggle__icon" fill="none" viewBox="0 0 24 24"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
  }
  return <svg aria-hidden="true" className="theme-toggle__icon" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.72 5.28l-1.42 1.42M6.7 17.3l-1.42 1.42M18.72 18.72 17.3 17.3M6.7 6.7 5.28 5.28" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

/** 中文注释：图标按钮显示当前主题，并通过可访问名称说明点击后将切换到的主题。 */
export function ThemeSelector() {
  const { mode, setMode } = useTheme();
  const nextMode: ThemeMode = mode === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`切换为${nextMode === "light" ? "浅色" : "深色"}主题`}
      className="theme-toggle"
      data-theme-mode={mode}
      onClick={() => setMode(nextMode)}
      title={`切换为${nextMode === "light" ? "浅色" : "深色"}主题`}
      type="button"
    >
      <ThemeIcon mode={mode} />
    </button>
  );
}
